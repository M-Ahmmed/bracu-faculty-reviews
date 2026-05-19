-- BRACU Faculty Reviews v0.5.2
-- Stable admin + smart notification engine.
-- Safe patch: no table drops, no data loss.
-- Run after v0.4.6 community_update_v046.sql and your previous Aura/profile patches.

-- 1) Missing faculty watch table.
CREATE TABLE IF NOT EXISTS public.faculty_watchers (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    full_email TEXT,
    query_type TEXT NOT NULL DEFAULT 'faculty',
    original_query TEXT,
    normalized_query TEXT NOT NULL,
    search_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(username, query_type, normalized_query)
);

CREATE INDEX IF NOT EXISTS faculty_watchers_query_idx
    ON public.faculty_watchers (query_type, normalized_query, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS faculty_watchers_username_idx
    ON public.faculty_watchers (username, last_seen_at DESC);

ALTER TABLE public.faculty_watchers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'faculty_watchers'
          AND policyname = 'faculty_watchers_no_direct_public_access'
    ) THEN
        CREATE POLICY faculty_watchers_no_direct_public_access
        ON public.faculty_watchers
        FOR SELECT
        TO anon, authenticated
        USING (FALSE);
    END IF;
END $$;

-- 2) Small helper functions.
CREATE OR REPLACE FUNCTION public.normalize_faculty_watch_key(p_value TEXT, p_query_type TEXT DEFAULT 'faculty')
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN lower(trim(COALESCE(p_query_type, 'faculty'))) = 'course'
            THEN regexp_replace(upper(trim(COALESCE(p_value, ''))), '\s+', '', 'g')
        ELSE regexp_replace(upper(trim(COALESCE(p_value, ''))), '[^A-Z0-9]', '', 'g')
    END;
$$;

CREATE OR REPLACE FUNCTION public.send_user_notification_once(
    p_username TEXT,
    p_title TEXT,
    p_message TEXT DEFAULT NULL,
    p_points_delta INTEGER DEFAULT 0,
    p_source_type TEXT DEFAULT 'site',
    p_source_id TEXT DEFAULT NULL,
    p_dedupe_days INTEGER DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
    v_title TEXT;
    v_source_type TEXT;
    v_source_id TEXT;
BEGIN
    v_username := lower(trim(COALESCE(p_username, '')));
    v_title := trim(COALESCE(p_title, 'Update'));
    v_source_type := COALESCE(NULLIF(trim(p_source_type), ''), 'site');
    v_source_id := NULLIF(trim(COALESCE(p_source_id, '')), '');

    IF v_username = '' THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.user_notifications n
        WHERE n.username = v_username
          AND COALESCE(n.source_type, 'site') = v_source_type
          AND COALESCE(n.source_id, '') = COALESCE(v_source_id, '')
          AND n.title = v_title
          AND n.created_at >= NOW() - make_interval(days => GREATEST(1, COALESCE(p_dedupe_days, 30)))
    ) THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.user_notifications (
        username,
        title,
        message,
        points_delta,
        source_type,
        source_id,
        is_read,
        created_at
    )
    VALUES (
        v_username,
        v_title,
        NULLIF(p_message, ''),
        COALESCE(p_points_delta, 0),
        v_source_type,
        v_source_id,
        FALSE,
        NOW()
    );

    RETURN TRUE;
END;
$$;

-- 3) Frontend calls this after a missing faculty search.
CREATE OR REPLACE FUNCTION public.record_missing_faculty_watch(
    p_username TEXT,
    p_full_email TEXT,
    p_query TEXT,
    p_query_type TEXT DEFAULT 'faculty'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
    v_email TEXT;
    v_query_type TEXT;
    v_norm TEXT;
BEGIN
    v_email := lower(trim(COALESCE(p_full_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));
    v_query_type := lower(trim(COALESCE(p_query_type, 'faculty')));
    v_norm := public.normalize_faculty_watch_key(p_query, v_query_type);

    IF v_username = '' OR v_email !~* '^[A-Z0-9._%+-]+@g\.bracu\.ac\.bd$' THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_user');
    END IF;

    -- Keep this v1 focused: missing faculty watches only. Course watches can come later.
    IF v_query_type <> 'faculty' OR char_length(v_norm) < 2 OR char_length(v_norm) > 20 THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'ignored');
    END IF;

    INSERT INTO public.faculty_watchers (
        username,
        full_email,
        query_type,
        original_query,
        normalized_query,
        search_count,
        first_seen_at,
        last_seen_at,
        created_at,
        updated_at
    )
    VALUES (
        v_username,
        v_email,
        v_query_type,
        NULLIF(trim(COALESCE(p_query, '')), ''),
        v_norm,
        1,
        NOW(),
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (username, query_type, normalized_query)
    DO UPDATE SET
        full_email = COALESCE(NULLIF(EXCLUDED.full_email, ''), public.faculty_watchers.full_email),
        original_query = COALESCE(NULLIF(EXCLUDED.original_query, ''), public.faculty_watchers.original_query),
        search_count = COALESCE(public.faculty_watchers.search_count, 0) + 1,
        last_seen_at = NOW(),
        updated_at = NOW();

    RETURN jsonb_build_object('ok', TRUE, 'normalized_query', v_norm);
END;
$$;

-- 4) Notify watchers + relevant reviewers when a new community page appears.
CREATE OR REPLACE FUNCTION public.notify_community_page_created(
    p_community_faculty_id BIGINT,
    p_actor_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    f RECORD;
    r RECORD;
    v_label TEXT;
    v_initial TEXT;
    v_courses TEXT[];
    v_dept TEXT;
    v_dept_review_count BIGINT := 0;
    v_dept_page_count BIGINT := 0;
    v_sent_watchers INTEGER := 0;
    v_sent_requests INTEGER := 0;
    v_undercovered BOOLEAN := FALSE;
    v_message TEXT;
BEGIN
    SELECT * INTO f
    FROM public.community_faculty_profiles
    WHERE id = p_community_faculty_id
      AND COALESCE(is_hidden, FALSE) = FALSE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'page_not_found');
    END IF;

    v_label := COALESCE(NULLIF(trim(f.faculty_name), ''), f.faculty_initial, f.faculty_initial_norm, 'Faculty');
    v_initial := COALESCE(f.faculty_initial_norm, public.normalize_faculty_watch_key(f.faculty_initial, 'faculty'));
    v_courses := COALESCE(f.course_codes, ARRAY[]::TEXT[]);
    v_dept := lower(trim(COALESCE(f.department, '')));

    IF v_dept <> '' THEN
        SELECT COUNT(*) INTO v_dept_page_count
        FROM public.community_faculty_profiles x
        WHERE lower(trim(COALESCE(x.department, ''))) = v_dept
          AND COALESCE(x.is_hidden, FALSE) = FALSE;

        SELECT COUNT(*) INTO v_dept_review_count
        FROM public.community_faculty_reviews r2
        JOIN public.community_faculty_profiles p2 ON p2.id = r2.community_faculty_id
        WHERE lower(trim(COALESCE(p2.department, ''))) = v_dept
          AND COALESCE(r2.is_hidden, FALSE) = FALSE;
    END IF;

    v_undercovered := (v_dept <> '' AND (v_dept_page_count <= 5 OR v_dept_review_count < 20));

    -- 4A) Personal: users who searched this exact missing faculty earlier.
    FOR r IN
        SELECT fw.username
        FROM public.faculty_watchers fw
        WHERE fw.query_type = 'faculty'
          AND fw.normalized_query = v_initial
          AND fw.username <> lower(trim(COALESCE(p_actor_username, '')))
        ORDER BY fw.last_seen_at DESC
        LIMIT 120
    LOOP
        IF public.send_user_notification_once(
            r.username,
            v_label || ' is now listed',
            'You searched for ' || v_label || ' earlier. Someone started the page — check it or share it with seniors who took the course.',
            0,
            'community_faculty_watch',
            p_community_faculty_id::TEXT,
            30
        ) THEN
            v_sent_watchers := v_sent_watchers + 1;
            UPDATE public.faculty_watchers
            SET last_notified_at = NOW(), updated_at = NOW()
            WHERE username = r.username
              AND query_type = 'faculty'
              AND normalized_query = v_initial;
        END IF;
    END LOOP;

    -- 4B) Smart review requests: same course / same department / small rescue sample.
    FOR r IN
        WITH course_searchers AS (
            SELECT DISTINCT e.username, 90 AS priority, 'course_search' AS reason
            FROM public.user_activity_events e
            WHERE e.event_type = 'search'
              AND e.target_type = 'course'
              AND public.normalize_faculty_watch_key(COALESCE(e.target_id, e.event_label), 'course') = ANY(v_courses)
              AND e.username IS NOT NULL
        ),
        course_reviewers AS (
            SELECT DISTINCT cr.username, 95 AS priority, 'course_review' AS reason
            FROM public.community_faculty_reviews cr
            WHERE cr.course_code = ANY(v_courses)
              AND COALESCE(cr.is_hidden, FALSE) = FALSE
              AND cr.username IS NOT NULL
        ),
        department_people AS (
            SELECT DISTINCT cr.username, 60 AS priority, 'department_activity' AS reason
            FROM public.community_faculty_reviews cr
            JOIN public.community_faculty_profiles p ON p.id = cr.community_faculty_id
            WHERE v_dept <> ''
              AND lower(trim(COALESCE(p.department, ''))) = v_dept
              AND COALESCE(cr.is_hidden, FALSE) = FALSE
              AND cr.username IS NOT NULL
            UNION
            SELECT DISTINCT rr.username, 45 AS priority, 'department_reaction' AS reason
            FROM public.review_reactions rr
            JOIN public.community_faculty_reviews cr ON cr.id = rr.review_id
            JOIN public.community_faculty_profiles p ON p.id = cr.community_faculty_id
            WHERE v_dept <> ''
              AND lower(trim(COALESCE(p.department, ''))) = v_dept
              AND rr.username IS NOT NULL
        ),
        rescue_sample AS (
            SELECT sp.username, 20 AS priority, 'growth_rescue' AS reason
            FROM public.student_profiles sp
            WHERE v_undercovered = TRUE
              AND sp.username IS NOT NULL
              AND sp.username <> lower(trim(COALESCE(p_actor_username, '')))
            ORDER BY sp.last_visited_at DESC NULLS LAST, sp.first_seen DESC NULLS LAST
            LIMIT 18
        ),
        combined AS (
            SELECT * FROM course_searchers
            UNION ALL SELECT * FROM course_reviewers
            UNION ALL SELECT * FROM department_people
            UNION ALL SELECT * FROM rescue_sample
        ),
        ranked AS (
            SELECT DISTINCT ON (username) username, priority, reason
            FROM combined
            WHERE username IS NOT NULL
              AND username <> lower(trim(COALESCE(p_actor_username, '')))
              AND NOT EXISTS (
                  SELECT 1 FROM public.user_notifications n
                  WHERE n.username = combined.username
                    AND n.source_type IN ('community_faculty_watch', 'community_faculty_request')
                    AND n.source_id = p_community_faculty_id::TEXT
              )
              AND (
                  SELECT COUNT(*)
                  FROM public.user_notifications n2
                  WHERE n2.username = combined.username
                    AND n2.source_type = 'community_faculty_request'
                    AND (n2.created_at AT TIME ZONE 'Asia/Dhaka')::DATE = (NOW() AT TIME ZONE 'Asia/Dhaka')::DATE
              ) < 3
            ORDER BY username, priority DESC
        )
        SELECT *
        FROM ranked
        ORDER BY priority DESC
        LIMIT 45
    LOOP
        v_message := CASE
            WHEN r.reason = 'course_search' THEN
                'You searched this course before. If you took ' || COALESCE(array_to_string(v_courses, ', '), 'this course') || ' with ' || v_label || ', drop a quick review.'
            WHEN r.reason = 'course_review' THEN
                'You reviewed this course before. A new page needs student reviews for ' || v_label || '.'
            WHEN r.reason LIKE 'department%' THEN
                'You have activity in this department. If you know ' || v_label || ', your review can help this page grow.'
            ELSE
                'This department has very few reviews right now. If you know ' || v_label || ', your review can help open the map for more students.'
        END;

        IF public.send_user_notification_once(
            r.username,
            'Review request: ' || v_label,
            v_message,
            0,
            'community_faculty_request',
            p_community_faculty_id::TEXT,
            14
        ) THEN
            v_sent_requests := v_sent_requests + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'watcher_notifications', v_sent_watchers,
        'review_requests', v_sent_requests,
        'undercovered_department', v_undercovered
    );
END;
$$;

-- 5) Notify meaningful review milestones on community pages.
CREATE OR REPLACE FUNCTION public.notify_community_review_milestone(
    p_review_id BIGINT,
    p_is_first_review BOOLEAN DEFAULT FALSE,
    p_verdict_unlocked BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rv RECORD;
    rec RECORD;
    v_label TEXT;
    v_initial TEXT;
    v_sent INTEGER := 0;
BEGIN
    SELECT
        r.*,
        p.faculty_initial_norm,
        p.faculty_initial,
        p.faculty_name,
        p.added_by_username
    INTO rv
    FROM public.community_faculty_reviews r
    JOIN public.community_faculty_profiles p ON p.id = r.community_faculty_id
    WHERE r.id = p_review_id
      AND r.target_type = 'community'
      AND COALESCE(r.is_hidden, FALSE) = FALSE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_community_review');
    END IF;

    v_label := COALESCE(NULLIF(trim(rv.faculty_name), ''), rv.faculty_initial, rv.faculty_initial_norm, 'Faculty');
    v_initial := COALESCE(rv.faculty_initial_norm, public.normalize_faculty_watch_key(rv.faculty_initial, 'faculty'));

    IF p_is_first_review THEN
        -- Page creator gets a dopamine/impact receipt.
        IF rv.added_by_username IS NOT NULL AND rv.added_by_username <> rv.username THEN
            IF public.send_user_notification_once(
                rv.added_by_username,
                'First review landed for ' || v_label,
                'The page you started now has its first student review.',
                0,
                'community_review',
                p_review_id::TEXT,
                30
            ) THEN v_sent := v_sent + 1; END IF;
        END IF;

        -- Previous exact searchers get a relevant update.
        FOR rec IN
            SELECT fw.username
            FROM public.faculty_watchers fw
            WHERE fw.query_type = 'faculty'
              AND fw.normalized_query = v_initial
              AND fw.username <> rv.username
            ORDER BY fw.last_seen_at DESC
            LIMIT 120
        LOOP
            IF public.send_user_notification_once(
                rec.username,
                'First review landed for ' || v_label,
                'You searched this faculty earlier. The page now has its first student review.',
                0,
                'community_review',
                p_review_id::TEXT,
                30
            ) THEN v_sent := v_sent + 1; END IF;
        END LOOP;

        -- People who opened this community faculty page before also get the first-review update.
        FOR rec IN
            SELECT DISTINCT e.username
            FROM public.user_activity_events e
            WHERE e.event_type = 'faculty_open'
              AND e.username IS NOT NULL
              AND e.username <> rv.username
              AND (
                  e.target_id = rv.community_faculty_id::TEXT
                  OR e.target_id = 'community-' || rv.community_faculty_id::TEXT
                  OR (e.metadata ->> 'source') = 'community' AND e.event_label = v_label
              )
            ORDER BY e.username
            LIMIT 120
        LOOP
            IF public.send_user_notification_once(
                rec.username,
                'First review landed for ' || v_label,
                'You opened this page before. It now has its first student review.',
                0,
                'community_review',
                p_review_id::TEXT,
                30
            ) THEN v_sent := v_sent + 1; END IF;
        END LOOP;
    END IF;

    IF p_verdict_unlocked THEN
        -- Creator + watchers + reviewers who touched this page get a milestone.
        FOR rec IN
            WITH people AS (
                SELECT rv.added_by_username AS username
                UNION
                SELECT fw.username
                FROM public.faculty_watchers fw
                WHERE fw.query_type = 'faculty' AND fw.normalized_query = v_initial
                UNION
                SELECT cr.username
                FROM public.community_faculty_reviews cr
                WHERE cr.target_type = 'community'
                  AND cr.community_faculty_id = rv.community_faculty_id
                  AND COALESCE(cr.is_hidden, FALSE) = FALSE
                UNION
                SELECT e.username
                FROM public.user_activity_events e
                WHERE e.event_type = 'faculty_open'
                  AND e.username IS NOT NULL
                  AND (e.target_id = rv.community_faculty_id::TEXT OR e.target_id = 'community-' || rv.community_faculty_id::TEXT)
            )
            SELECT DISTINCT username
            FROM people
            WHERE username IS NOT NULL
              AND username <> ''
            LIMIT 160
        LOOP
            IF public.send_user_notification_once(
                rec.username,
                'Community Verdict unlocked for ' || v_label,
                'Enough students reviewed this page, so it now has an overall Community Verdict.',
                0,
                'community_faculty_milestone',
                rv.community_faculty_id::TEXT,
                30
            ) THEN v_sent := v_sent + 1; END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object('ok', TRUE, 'sent', v_sent);
END;
$$;

-- 6) Recreate add-faculty RPC so new pages trigger the notification engine.
DROP FUNCTION IF EXISTS public.create_community_faculty_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_community_faculty_profile(
    p_faculty_initial TEXT,
    p_course_code TEXT,
    p_faculty_name TEXT DEFAULT NULL,
    p_department TEXT DEFAULT NULL,
    p_username TEXT DEFAULT NULL,
    p_student_email TEXT DEFAULT NULL
)
RETURNS TABLE (
    id BIGINT,
    faculty_initial TEXT,
    faculty_initial_norm TEXT,
    faculty_name TEXT,
    department TEXT,
    course_codes TEXT[],
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_initial TEXT;
    v_initial_norm TEXT;
    v_email TEXT;
    v_username TEXT;
    v_existing_id BIGINT;
    v_demand JSONB;
    v_unique_students INTEGER := 0;
    v_bonus INTEGER := 0;
    v_xp INTEGER := 25;
    v_courses TEXT[] := ARRAY[]::TEXT[];
    v_course TEXT;
BEGIN
    v_initial := upper(trim(COALESCE(p_faculty_initial, '')));
    v_initial_norm := regexp_replace(v_initial, '[^A-Z0-9]', '', 'g');
    v_email := lower(trim(COALESCE(p_student_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));

    IF v_email !~* '^[A-Z0-9._%+-]+@g\.bracu\.ac\.bd$' THEN
        RAISE EXCEPTION 'Use a valid @g.bracu.ac.bd email.';
    END IF;

    IF char_length(v_initial_norm) < 2 OR char_length(v_initial_norm) > 12 THEN
        RAISE EXCEPTION 'Enter a clean faculty initial.';
    END IF;

    FOR v_course IN
        SELECT DISTINCT regexp_replace(upper(trim(x)), '\s+', '', 'g')
        FROM regexp_split_to_table(COALESCE(p_course_code, ''), '[,;\n]+') AS x
    LOOP
        IF v_course IS NULL OR v_course = '' THEN CONTINUE; END IF;
        IF v_course !~ '^[A-Z]{2,5}[0-9]{2,4}$' THEN
            RAISE EXCEPTION 'Enter valid course codes like CSE220, CSE221.';
        END IF;
        v_courses := array_append(v_courses, v_course);
    END LOOP;

    IF array_length(v_courses, 1) IS NULL THEN
        RAISE EXCEPTION 'Enter at least one valid course code.';
    END IF;

    SELECT ARRAY(SELECT DISTINCT c FROM unnest(v_courses) AS c ORDER BY c) INTO v_courses;

    PERFORM public.ensure_student_contributor_profile(v_username, v_email);

    SELECT cfp.id INTO v_existing_id
    FROM public.community_faculty_profiles cfp
    WHERE cfp.faculty_initial_norm = v_initial_norm
    LIMIT 1;

    v_demand := public.get_missing_search_demand(v_initial_norm, 'faculty');
    v_unique_students := COALESCE((v_demand ->> 'unique_students')::INTEGER, 0);
    v_bonus := CASE
        WHEN v_unique_students >= 30 THEN 75
        WHEN v_unique_students >= 20 THEN 55
        WHEN v_unique_students >= 10 THEN 40
        WHEN v_unique_students >= 5 THEN 25
        WHEN v_unique_students >= 2 THEN 12
        ELSE 0
    END;
    v_xp := v_xp + v_bonus;

    INSERT INTO public.community_faculty_profiles (
        faculty_initial, faculty_name, department, course_codes, added_by_username, added_by_email
    )
    VALUES (
        v_initial_norm,
        NULLIF(trim(COALESCE(p_faculty_name, '')), ''),
        NULLIF(trim(COALESCE(p_department, '')), ''),
        v_courses,
        v_username,
        v_email
    )
    ON CONFLICT (faculty_initial_norm)
    DO UPDATE SET
        faculty_name = COALESCE(NULLIF(trim(COALESCE(EXCLUDED.faculty_name, '')), ''), public.community_faculty_profiles.faculty_name),
        department = COALESCE(NULLIF(trim(COALESCE(EXCLUDED.department, '')), ''), public.community_faculty_profiles.department),
        course_codes = (
            SELECT ARRAY(
                SELECT DISTINCT c
                FROM unnest(public.community_faculty_profiles.course_codes || EXCLUDED.course_codes) AS c
                WHERE c IS NOT NULL AND c <> ''
                ORDER BY c
            )
        ),
        updated_at = NOW()
    RETURNING
        public.community_faculty_profiles.id,
        public.community_faculty_profiles.faculty_initial,
        public.community_faculty_profiles.faculty_initial_norm,
        public.community_faculty_profiles.faculty_name,
        public.community_faculty_profiles.department,
        public.community_faculty_profiles.course_codes,
        public.community_faculty_profiles.created_at,
        public.community_faculty_profiles.updated_at
    INTO id, faculty_initial, faculty_initial_norm, faculty_name, department, course_codes, created_at, updated_at;

    IF v_existing_id IS NULL THEN
        PERFORM public.add_user_credit_event(
            v_username, v_email, v_xp, 'faculty_page_added', 'community_faculty', id::TEXT,
            CASE WHEN v_bonus > 0 THEN 'High-demand page opened' ELSE 'Page opened' END,
            CASE WHEN v_unique_students >= 2
                THEN 'You started ' || v_initial_norm || '''s page. ' || v_unique_students::TEXT || ' lost searches now have somewhere to land.'
                ELSE 'You created a missing faculty page. Seniors can review it now.'
            END,
            TRUE,
            jsonb_build_object('faculty_initial', v_initial_norm, 'course_codes', v_courses, 'primary_course_code', v_courses[1], 'demand_unique_students', v_unique_students, 'demand_bonus', v_bonus, 'aura_name', 'Aura')
        );

        PERFORM public.notify_community_page_created(id, v_username);
    END IF;

    IF to_regclass('public.user_activity_events') IS NOT NULL THEN
        INSERT INTO public.user_activity_events (username, event_type, target_type, target_id, event_label, metadata, created_at)
        VALUES (v_username, 'community_faculty_create', 'community_faculty', id::TEXT, v_initial_norm, jsonb_build_object('course_codes', v_courses, 'primary_course_code', v_courses[1], 'demand_unique_students', v_unique_students), NOW());
    END IF;

    RETURN NEXT;
END;
$$;

-- 7) Recreate review RPC so first-review/verdict notifications are sent.
DROP FUNCTION IF EXISTS public.submit_community_faculty_review(TEXT, BIGINT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB, TEXT[], TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_community_faculty_review(
    p_target_type TEXT,
    p_community_faculty_id BIGINT DEFAULT NULL,
    p_archive_faculty_id BIGINT DEFAULT NULL,
    p_student_email TEXT DEFAULT NULL,
    p_username TEXT DEFAULT NULL,
    p_course_code TEXT DEFAULT NULL,
    p_teaching_rating NUMERIC DEFAULT NULL,
    p_marking_rating NUMERIC DEFAULT NULL,
    p_behavior_rating NUMERIC DEFAULT NULL,
    p_selected_tags JSONB DEFAULT '{}'::jsonb,
    p_tag_labels TEXT[] DEFAULT '{}',
    p_generated_summary TEXT DEFAULT NULL,
    p_personal_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_type TEXT;
    v_course TEXT;
    v_email TEXT;
    v_username TEXT;
    v_existing_review_id BIGINT;
    v_review_id BIGINT;
    v_prior_count BIGINT := 0;
    v_xp INTEGER := 0;
    v_unlock BOOLEAN := FALSE;
    v_first BOOLEAN := FALSE;
    v_has_note BOOLEAN := FALSE;
BEGIN
    v_target_type := lower(trim(COALESCE(p_target_type, '')));
    v_course := regexp_replace(upper(trim(COALESCE(p_course_code, ''))), '\s+', '', 'g');
    v_email := lower(trim(COALESCE(p_student_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));
    v_has_note := NULLIF(trim(COALESCE(p_personal_note, '')), '') IS NOT NULL;

    IF v_target_type NOT IN ('archive', 'community') THEN RAISE EXCEPTION 'Invalid review target.'; END IF;
    IF v_email !~* '^[A-Z0-9._%+-]+@g\.bracu\.ac\.bd$' THEN RAISE EXCEPTION 'Use a valid @g.bracu.ac.bd email.'; END IF;
    IF v_course !~ '^[A-Z]{2,5}[0-9]{2,4}$' THEN RAISE EXCEPTION 'Enter a valid course code like CSE220.'; END IF;

    IF p_teaching_rating < 1 OR p_teaching_rating > 10
       OR p_marking_rating < 1 OR p_marking_rating > 10
       OR p_behavior_rating < 1 OR p_behavior_rating > 10 THEN
        RAISE EXCEPTION 'Ratings must be between 1 and 10.';
    END IF;

    IF p_personal_note IS NOT NULL AND char_length(p_personal_note) > 500 THEN
        RAISE EXCEPTION 'Personal note is too long.';
    END IF;

    PERFORM public.ensure_student_contributor_profile(v_username, v_email);

    IF v_target_type = 'community' THEN
        IF p_community_faculty_id IS NULL THEN RAISE EXCEPTION 'Community faculty id is required.'; END IF;

        SELECT r.id INTO v_existing_review_id
        FROM public.community_faculty_reviews r
        WHERE r.target_type = 'community'
          AND r.student_email = v_email
          AND r.community_faculty_id = p_community_faculty_id
          AND r.course_code = v_course
        LIMIT 1;

        SELECT COUNT(*) INTO v_prior_count
        FROM public.community_faculty_reviews r
        WHERE r.target_type = 'community'
          AND r.community_faculty_id = p_community_faculty_id
          AND COALESCE(r.is_hidden, FALSE) = FALSE;

        INSERT INTO public.community_faculty_reviews (
            target_type, community_faculty_id, student_email, username, course_code,
            teaching_rating, marking_rating, behavior_rating, selected_tags, tag_labels,
            generated_summary, personal_note
        )
        VALUES (
            'community', p_community_faculty_id, v_email, v_username, v_course,
            p_teaching_rating, p_marking_rating, p_behavior_rating,
            COALESCE(p_selected_tags, '{}'::jsonb), COALESCE(p_tag_labels, '{}'),
            NULLIF(trim(COALESCE(p_generated_summary, '')), ''), NULLIF(trim(COALESCE(p_personal_note, '')), '')
        )
        ON CONFLICT (student_email, community_faculty_id, course_code)
        WHERE target_type = 'community'
        DO UPDATE SET
            teaching_rating = EXCLUDED.teaching_rating,
            marking_rating = EXCLUDED.marking_rating,
            behavior_rating = EXCLUDED.behavior_rating,
            selected_tags = EXCLUDED.selected_tags,
            tag_labels = EXCLUDED.tag_labels,
            generated_summary = EXCLUDED.generated_summary,
            personal_note = EXCLUDED.personal_note,
            is_hidden = FALSE,
            updated_at = NOW()
        RETURNING id INTO v_review_id;

        UPDATE public.community_faculty_profiles
        SET course_codes = (
            SELECT ARRAY(
                SELECT DISTINCT c
                FROM unnest(public.community_faculty_profiles.course_codes || ARRAY[v_course]) AS c
                WHERE c IS NOT NULL AND c <> ''
                ORDER BY c
            )
        )
        WHERE id = p_community_faculty_id;
    ELSE
        IF p_archive_faculty_id IS NULL THEN RAISE EXCEPTION 'Archive faculty id is required.'; END IF;

        SELECT r.id INTO v_existing_review_id
        FROM public.community_faculty_reviews r
        WHERE r.target_type = 'archive'
          AND r.student_email = v_email
          AND r.archive_faculty_id = p_archive_faculty_id
          AND r.course_code = v_course
        LIMIT 1;

        SELECT COUNT(*) INTO v_prior_count
        FROM public.community_faculty_reviews r
        WHERE r.target_type = 'archive'
          AND r.archive_faculty_id = p_archive_faculty_id
          AND COALESCE(r.is_hidden, FALSE) = FALSE;

        INSERT INTO public.community_faculty_reviews (
            target_type, archive_faculty_id, student_email, username, course_code,
            teaching_rating, marking_rating, behavior_rating, selected_tags, tag_labels,
            generated_summary, personal_note
        )
        VALUES (
            'archive', p_archive_faculty_id, v_email, v_username, v_course,
            p_teaching_rating, p_marking_rating, p_behavior_rating,
            COALESCE(p_selected_tags, '{}'::jsonb), COALESCE(p_tag_labels, '{}'),
            NULLIF(trim(COALESCE(p_generated_summary, '')), ''), NULLIF(trim(COALESCE(p_personal_note, '')), '')
        )
        ON CONFLICT (student_email, archive_faculty_id, course_code)
        WHERE target_type = 'archive'
        DO UPDATE SET
            teaching_rating = EXCLUDED.teaching_rating,
            marking_rating = EXCLUDED.marking_rating,
            behavior_rating = EXCLUDED.behavior_rating,
            selected_tags = EXCLUDED.selected_tags,
            tag_labels = EXCLUDED.tag_labels,
            generated_summary = EXCLUDED.generated_summary,
            personal_note = EXCLUDED.personal_note,
            is_hidden = FALSE,
            updated_at = NOW()
        RETURNING id INTO v_review_id;
    END IF;

    IF v_existing_review_id IS NULL THEN
        v_first := v_prior_count = 0;
        v_unlock := (v_target_type = 'community' AND v_prior_count < 5 AND v_prior_count + 1 >= 5);

        v_xp := 20;
        IF v_has_note THEN v_xp := v_xp + 5; END IF;
        IF v_first THEN v_xp := v_xp + 35; END IF;
        IF v_unlock THEN v_xp := v_xp + 75; END IF;

        PERFORM public.add_user_credit_event(
            v_username, v_email, v_xp,
            CASE WHEN v_unlock THEN 'community_verdict_unlocked' ELSE 'review_submitted' END,
            'community_review', v_review_id::TEXT,
            CASE WHEN v_unlock THEN 'Community Verdict unlocked' WHEN v_first THEN 'First review added' ELSE 'Review added' END,
            CASE WHEN v_unlock THEN 'Your review completed the 5-review threshold. Future juniors can now see an overall Community Verdict.'
                 WHEN v_first THEN 'You gave this faculty its first community review before advising.'
                 ELSE 'Your review is now part of the community feedback.' END,
            TRUE,
            jsonb_build_object('course_code', v_course, 'target_type', v_target_type, 'first_review', v_first, 'verdict_unlocked', v_unlock, 'personal_note_bonus', v_has_note, 'aura_name', 'Aura')
        );

        IF v_target_type = 'community' THEN
            PERFORM public.notify_community_review_milestone(v_review_id, v_first, v_unlock);
        END IF;
    END IF;

    IF to_regclass('public.user_activity_events') IS NOT NULL THEN
        INSERT INTO public.user_activity_events (username, event_type, target_type, target_id, event_label, metadata, created_at)
        VALUES (
            v_username,
            'community_review_create',
            CASE WHEN v_target_type = 'archive' THEN 'faculty' ELSE 'community_faculty' END,
            COALESCE(p_archive_faculty_id::TEXT, p_community_faculty_id::TEXT),
            v_course,
            jsonb_build_object('course_code', v_course, 'review_target', v_target_type, 'review_id', v_review_id, 'verdict_unlocked', v_unlock),
            NOW()
        );
    END IF;
END;
$$;

-- 8) Static admin notification pulse. Keeps admin stable; no deep links.
CREATE OR REPLACE FUNCTION public.admin_get_notification_pulse(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start DATE := COALESCE(p_start_date, '2000-01-01'::DATE);
    v_end DATE := COALESCE(p_end_date, (NOW() AT TIME ZONE 'Asia/Dhaka')::DATE);
    output JSONB;
BEGIN
    SELECT jsonb_build_object(
        'stats', jsonb_build_object(
            'notifications', COALESCE((
                SELECT COUNT(*) FROM public.user_notifications n
                WHERE (n.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN v_start AND v_end
            ), 0),
            'unread', COALESCE((
                SELECT COUNT(*) FROM public.user_notifications n
                WHERE COALESCE(n.is_read, FALSE) = FALSE
                  AND (n.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN v_start AND v_end
            ), 0),
            'review_requests', COALESCE((
                SELECT COUNT(*) FROM public.user_notifications n
                WHERE n.source_type = 'community_faculty_request'
                  AND (n.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN v_start AND v_end
            ), 0),
            'watchers', COALESCE((SELECT COUNT(*) FROM public.faculty_watchers), 0),
            'watched_faculties', COALESCE((SELECT COUNT(DISTINCT normalized_query) FROM public.faculty_watchers WHERE query_type='faculty'), 0)
        ),
        'recent_notifications', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
            FROM (
                SELECT n.id, n.username, n.title, n.message, n.points_delta, n.source_type, n.source_id, n.is_read, n.created_at
                FROM public.user_notifications n
                WHERE (n.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN v_start AND v_end
                ORDER BY n.created_at DESC
                LIMIT 80
            ) x
        ), '[]'::jsonb),
        'top_watches', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.unique_students DESC, x.total_searches DESC, x.last_seen_at DESC)
            FROM (
                SELECT normalized_query, query_type, COUNT(DISTINCT username)::BIGINT AS unique_students, SUM(search_count)::BIGINT AS total_searches, MAX(last_seen_at) AS last_seen_at
                FROM public.faculty_watchers
                GROUP BY normalized_query, query_type
                ORDER BY unique_students DESC, total_searches DESC, last_seen_at DESC
                LIMIT 30
            ) x
        ), '[]'::jsonb)
    ) INTO output;
    RETURN output;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_missing_faculty_watch(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_faculty_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_community_faculty_review(TEXT, BIGINT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB, TEXT[], TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_pulse(DATE, DATE) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
