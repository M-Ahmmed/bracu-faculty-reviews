-- BRACU Faculty Reviews v0.4.2 Aura Economy
-- Safe patch: renames the visible reward language to Aura, adds daily/search Aura,
-- and boosts the contribution economy without changing existing table names.
-- Run after v0.3.8/v0.3.9 SQL patches.

-- 1) Silent Aura for meaningful exploration.
-- +5 Aura once per Bangladesh day after the user's first meaningful search.
-- +1 Aura per unique normalized search per day, max +5/day.
CREATE OR REPLACE FUNCTION public.award_aura_for_search(
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
    v_query TEXT;
    v_today DATE;
    v_daily_points INTEGER := 0;
    v_search_points INTEGER := 0;
    v_search_count_today INTEGER := 0;
    v_daily_source_id TEXT;
    v_search_source_id TEXT;
BEGIN
    v_email := lower(trim(COALESCE(p_full_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));
    v_query_type := lower(trim(COALESCE(p_query_type, 'faculty')));
    v_today := (NOW() AT TIME ZONE 'Asia/Dhaka')::DATE;

    IF v_email !~* '^[A-Z0-9._%+-]+@g\.bracu\.ac\.bd$' THEN
        RETURN jsonb_build_object('daily_awarded', 0, 'search_awarded', 0, 'total_awarded', 0, 'reason', 'invalid_email');
    END IF;

    IF v_query_type = 'course' THEN
        v_query := regexp_replace(upper(trim(COALESCE(p_query, ''))), '\s+', '', 'g');
    ELSE
        v_query := regexp_replace(upper(trim(COALESCE(p_query, ''))), '[^A-Z0-9]', '', 'g');
    END IF;

    IF length(v_query) < 2 THEN
        RETURN jsonb_build_object('daily_awarded', 0, 'search_awarded', 0, 'total_awarded', 0, 'reason', 'short_query');
    END IF;

    PERFORM public.ensure_student_contributor_profile(v_username, v_email);

    v_daily_source_id := 'daily:' || v_today::TEXT;
    IF NOT EXISTS (
        SELECT 1
        FROM public.user_credit_events ce
        WHERE ce.username = v_username
          AND ce.reason = 'daily_advising_checkin'
          AND ce.source_type = 'aura_activity'
          AND ce.source_id = v_daily_source_id
    ) THEN
        v_daily_points := 5;
        PERFORM public.add_user_credit_event(
            v_username,
            v_email,
            v_daily_points,
            'daily_advising_checkin',
            'aura_activity',
            v_daily_source_id,
            NULL,
            NULL,
            FALSE,
            jsonb_build_object('date', v_today, 'trigger', 'first_meaningful_search')
        );
    END IF;

    SELECT COUNT(*)
    INTO v_search_count_today
    FROM public.user_credit_events ce
    WHERE ce.username = v_username
      AND ce.reason = 'unique_search_exploration'
      AND (ce.created_at AT TIME ZONE 'Asia/Dhaka')::DATE = v_today;

    v_search_source_id := 'search:' || v_today::TEXT || ':' || v_query_type || ':' || v_query;
    IF v_search_count_today < 5
       AND NOT EXISTS (
            SELECT 1
            FROM public.user_credit_events ce
            WHERE ce.username = v_username
              AND ce.reason = 'unique_search_exploration'
              AND ce.source_type = 'aura_activity'
              AND ce.source_id = v_search_source_id
       ) THEN
        v_search_points := 1;
        PERFORM public.add_user_credit_event(
            v_username,
            v_email,
            v_search_points,
            'unique_search_exploration',
            'aura_activity',
            v_search_source_id,
            NULL,
            NULL,
            FALSE,
            jsonb_build_object('query', v_query, 'query_type', v_query_type, 'date', v_today)
        );
    END IF;

    RETURN jsonb_build_object(
        'daily_awarded', v_daily_points,
        'search_awarded', v_search_points,
        'total_awarded', v_daily_points + v_search_points,
        'daily_limit', 5,
        'search_daily_cap', 5,
        'query', v_query,
        'query_type', v_query_type
    );
END;
$$;

-- 2) Demand bounty values now match the stronger Aura economy.
CREATE OR REPLACE FUNCTION public.get_signal_bounties(
    p_limit INTEGER DEFAULT 8
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH community_counts AS (
    SELECT
        f.id AS community_faculty_id,
        COALESCE(f.faculty_name, f.faculty_initial) AS faculty_label,
        f.faculty_initial,
        COALESCE(COUNT(r.id), 0)::BIGINT AS review_count,
        0::BIGINT AS unique_students,
        CASE
            WHEN COUNT(r.id) = 4 THEN 75
            WHEN COUNT(r.id) = 3 THEN 55
            WHEN COUNT(r.id) = 2 THEN 40
            WHEN COUNT(r.id) = 1 THEN 25
            ELSE 0
        END AS xp_reward,
        'almost_unlocked'::TEXT AS type,
        f.updated_at AS sort_time
    FROM public.community_faculty_profiles f
    LEFT JOIN public.community_faculty_reviews r
        ON r.target_type = 'community'
       AND r.community_faculty_id = f.id
       AND COALESCE(r.is_hidden, FALSE) = FALSE
    WHERE COALESCE(f.is_hidden, FALSE) = FALSE
    GROUP BY f.id, f.faculty_name, f.faculty_initial, f.updated_at
    HAVING COUNT(r.id) BETWEEN 1 AND 4
),
missing_searches AS (
    SELECT
        NULL::BIGINT AS community_faculty_id,
        regexp_replace(upper(COALESCE(e.target_id, e.event_label, '')), '[^A-Z0-9]', '', 'g') AS faculty_label,
        regexp_replace(upper(COALESCE(e.target_id, e.event_label, '')), '[^A-Z0-9]', '', 'g') AS faculty_initial,
        0::BIGINT AS review_count,
        COUNT(DISTINCT e.username)::BIGINT AS unique_students,
        CASE
            WHEN COUNT(DISTINCT e.username) >= 30 THEN 75
            WHEN COUNT(DISTINCT e.username) >= 20 THEN 55
            WHEN COUNT(DISTINCT e.username) >= 10 THEN 40
            WHEN COUNT(DISTINCT e.username) >= 5 THEN 25
            WHEN COUNT(DISTINCT e.username) >= 2 THEN 12
            ELSE 0
        END AS xp_reward,
        'missing_demand'::TEXT AS type,
        MAX(e.created_at) AS sort_time
    FROM public.user_activity_events e
    WHERE e.event_type = 'search'
      AND e.target_type = 'faculty'
      AND COALESCE((e.metadata ->> 'matched')::BOOLEAN, FALSE) = FALSE
      AND length(regexp_replace(upper(COALESCE(e.target_id, e.event_label, '')), '[^A-Z0-9]', '', 'g')) >= 2
      AND NOT EXISTS (
          SELECT 1
          FROM public.community_faculty_profiles f
          WHERE f.faculty_initial_norm = regexp_replace(upper(COALESCE(e.target_id, e.event_label, '')), '[^A-Z0-9]', '', 'g')
      )
    GROUP BY regexp_replace(upper(COALESCE(e.target_id, e.event_label, '')), '[^A-Z0-9]', '', 'g')
    HAVING COUNT(DISTINCT e.username) >= 2
),
all_bounties AS (
    SELECT * FROM community_counts
    UNION ALL
    SELECT * FROM missing_searches
)
SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.xp_reward DESC, x.unique_students DESC, x.review_count DESC, x.sort_time DESC), '[]'::jsonb)
FROM (
    SELECT *
    FROM all_bounties
    WHERE xp_reward > 0
    ORDER BY xp_reward DESC, unique_students DESC, review_count DESC, sort_time DESC
    LIMIT GREATEST(1, COALESCE(p_limit, 8))
) x;
$$;

-- 3) Stronger Aura for missing pages: +25 base + demand bounty.
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
    v_course TEXT;
    v_email TEXT;
    v_username TEXT;
    v_existing_id BIGINT;
    v_demand JSONB;
    v_unique_students INTEGER := 0;
    v_bonus INTEGER := 0;
    v_xp INTEGER := 25;
BEGIN
    v_initial := upper(trim(COALESCE(p_faculty_initial, '')));
    v_initial_norm := regexp_replace(v_initial, '[^A-Z0-9]', '', 'g');
    v_course := regexp_replace(upper(trim(COALESCE(p_course_code, ''))), '\s+', '', 'g');
    v_email := lower(trim(COALESCE(p_student_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));

    IF v_email !~* '^[A-Z0-9._%+-]+@g\.bracu\.ac\.bd$' THEN
        RAISE EXCEPTION 'Use a valid @g.bracu.ac.bd email.';
    END IF;

    IF char_length(v_initial_norm) < 2 OR char_length(v_initial_norm) > 12 THEN
        RAISE EXCEPTION 'Enter a clean faculty initial.';
    END IF;

    IF v_course !~ '^[A-Z]{2,5}[0-9]{2,4}$' THEN
        RAISE EXCEPTION 'Enter a valid course code like CSE220.';
    END IF;

    PERFORM public.ensure_student_contributor_profile(v_username, v_email);

    SELECT cfp.id
    INTO v_existing_id
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
        faculty_initial,
        faculty_name,
        department,
        course_codes,
        added_by_username,
        added_by_email
    )
    VALUES (
        v_initial_norm,
        NULLIF(trim(COALESCE(p_faculty_name, '')), ''),
        NULLIF(trim(COALESCE(p_department, '')), ''),
        ARRAY[v_course],
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
    INTO
        id,
        faculty_initial,
        faculty_initial_norm,
        faculty_name,
        department,
        course_codes,
        created_at,
        updated_at;

    IF v_existing_id IS NULL THEN
        PERFORM public.add_user_credit_event(
            v_username,
            v_email,
            v_xp,
            'faculty_page_added',
            'community_faculty',
            id::TEXT,
            CASE WHEN v_bonus > 0 THEN 'High-demand page opened' ELSE 'Page opened' END,
            CASE WHEN v_unique_students >= 2
                THEN 'You started ' || v_initial_norm || '''s page. ' || v_unique_students::TEXT || ' lost searches now have somewhere to land.'
                ELSE 'You created a missing faculty page. Seniors can review it now.'
            END,
            TRUE,
            jsonb_build_object('faculty_initial', v_initial_norm, 'course_code', v_course, 'demand_unique_students', v_unique_students, 'demand_bonus', v_bonus, 'aura_name', 'Aura')
        );
    END IF;

    IF to_regclass('public.user_activity_events') IS NOT NULL THEN
        INSERT INTO public.user_activity_events (username, event_type, target_type, target_id, event_label, metadata, created_at)
        VALUES (v_username, 'community_faculty_create', 'community_faculty', id::TEXT, v_initial_norm, jsonb_build_object('course_code', v_course, 'demand_unique_students', v_unique_students), NOW());
    END IF;

    RETURN NEXT;
END;
$$;

-- 4) Stronger Aura for reviews: +20 base, +5 note, +35 first review, +75 verdict unlock.
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
    v_source_id TEXT;
    v_unlock BOOLEAN := FALSE;
    v_first BOOLEAN := FALSE;
    v_has_note BOOLEAN := FALSE;
BEGIN
    v_target_type := lower(trim(COALESCE(p_target_type, '')));
    v_course := regexp_replace(upper(trim(COALESCE(p_course_code, ''))), '\s+', '', 'g');
    v_email := lower(trim(COALESCE(p_student_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));
    v_has_note := NULLIF(trim(COALESCE(p_personal_note, '')), '') IS NOT NULL;

    IF v_target_type NOT IN ('archive', 'community') THEN
        RAISE EXCEPTION 'Invalid review target.';
    END IF;

    IF v_email !~* '^[A-Z0-9._%+-]+@g\.bracu\.ac\.bd$' THEN
        RAISE EXCEPTION 'Use a valid @g.bracu.ac.bd email.';
    END IF;

    IF v_course !~ '^[A-Z]{2,5}[0-9]{2,4}$' THEN
        RAISE EXCEPTION 'Enter a valid course code like CSE220.';
    END IF;

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
        IF p_community_faculty_id IS NULL THEN
            RAISE EXCEPTION 'Community faculty id is required.';
        END IF;

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
        IF p_archive_faculty_id IS NULL THEN
            RAISE EXCEPTION 'Archive faculty id is required.';
        END IF;

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

        v_source_id := v_review_id::TEXT;
        PERFORM public.add_user_credit_event(
            v_username,
            v_email,
            v_xp,
            CASE WHEN v_unlock THEN 'community_verdict_unlocked' ELSE 'review_submitted' END,
            'community_review',
            v_source_id,
            CASE
                WHEN v_unlock THEN 'Community Verdict unlocked'
                WHEN v_first THEN 'First review added'
                ELSE 'Review added'
            END,
            CASE
                WHEN v_unlock THEN 'Your review completed the 5-review threshold. Future juniors can now see an overall Community Verdict.'
                WHEN v_first THEN 'You gave this faculty its first community review before advising.'
                ELSE 'Your review is now part of the community feedback.'
            END,
            TRUE,
            jsonb_build_object('course_code', v_course, 'target_type', v_target_type, 'first_review', v_first, 'verdict_unlocked', v_unlock, 'personal_note_bonus', v_has_note, 'aura_name', 'Aura')
        );
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

-- 5) Agree/Disagree Aura: Agree gives +8, Disagree still only -1.
CREATE OR REPLACE FUNCTION public.set_community_review_reaction(
    p_review_id BIGINT,
    p_reaction_type TEXT,
    p_username TEXT,
    p_full_email TEXT
)
RETURNS TABLE (
    review_id BIGINT,
    my_reaction TEXT,
    helpful_count BIGINT,
    not_useful_count BIGINT,
    report_count BIGINT,
    xp_delta INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
    v_email TEXT;
    v_reaction TEXT;
    v_old TEXT;
    v_author_username TEXT;
    v_author_email TEXT;
    v_old_points INTEGER := 0;
    v_new_points INTEGER := 0;
    v_delta INTEGER := 0;
BEGIN
    v_email := lower(trim(COALESCE(p_full_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));
    v_reaction := lower(trim(COALESCE(p_reaction_type, '')));

    IF v_email !~* '^[A-Z0-9._%+-]+@g\.bracu\.ac\.bd$' THEN
        RAISE EXCEPTION 'Use a valid @g.bracu.ac.bd email.';
    END IF;

    IF v_reaction NOT IN ('helpful', 'not_useful', 'report') THEN
        RAISE EXCEPTION 'Invalid reaction.';
    END IF;

    SELECT r.username, r.student_email
    INTO v_author_username, v_author_email
    FROM public.community_faculty_reviews r
    WHERE r.id = p_review_id
      AND r.is_hidden = FALSE;

    IF v_author_username IS NULL THEN
        RAISE EXCEPTION 'Review not found.';
    END IF;

    IF v_author_username = v_username OR lower(COALESCE(v_author_email, '')) = v_email THEN
        RAISE EXCEPTION 'You cannot react to your own review.';
    END IF;

    SELECT rr.reaction_type
    INTO v_old
    FROM public.review_reactions rr
    WHERE rr.review_type = 'community'
      AND rr.review_id = p_review_id
      AND rr.username = v_username;

    IF v_old = 'helpful' THEN v_old_points := 8;
    ELSIF v_old = 'not_useful' THEN v_old_points := -1;
    ELSE v_old_points := 0;
    END IF;

    IF v_reaction = 'helpful' THEN v_new_points := 8;
    ELSIF v_reaction = 'not_useful' THEN v_new_points := -1;
    ELSE v_new_points := 0;
    END IF;

    INSERT INTO public.review_reactions (
        review_type,
        review_id,
        username,
        student_email,
        reaction_type,
        created_at,
        updated_at
    )
    VALUES (
        'community',
        p_review_id,
        v_username,
        v_email,
        v_reaction,
        NOW(),
        NOW()
    )
    ON CONFLICT (review_type, review_id, username)
    DO UPDATE SET
        reaction_type = EXCLUDED.reaction_type,
        student_email = EXCLUDED.student_email,
        updated_at = NOW();

    v_delta := v_new_points - v_old_points;

    IF v_delta <> 0 THEN
        PERFORM public.add_user_credit_event(
            v_author_username,
            v_author_email,
            v_delta,
            'review_reaction_' || v_reaction,
            'community_review',
            p_review_id::TEXT,
            CASE WHEN v_reaction = 'helpful' AND v_delta > 0 THEN 'Someone agreed with your review' ELSE NULL END,
            CASE WHEN v_reaction = 'helpful' AND v_delta > 0 THEN '+8 Aura added to your private profile.' ELSE NULL END,
            CASE WHEN v_reaction = 'helpful' AND v_delta > 0 THEN TRUE ELSE FALSE END,
            jsonb_build_object('reaction_type', v_reaction, 'reactor', v_username, 'aura_name', 'Aura')
        );
    END IF;

    RETURN QUERY
    SELECT
        p_review_id AS review_id,
        v_reaction AS my_reaction,
        COALESCE((SELECT COUNT(*) FROM public.review_reactions x WHERE x.review_id = p_review_id AND x.reaction_type = 'helpful'), 0)::BIGINT AS helpful_count,
        COALESCE((SELECT COUNT(*) FROM public.review_reactions x WHERE x.review_id = p_review_id AND x.reaction_type = 'not_useful'), 0)::BIGINT AS not_useful_count,
        COALESCE((SELECT COUNT(*) FROM public.review_reactions x WHERE x.review_id = p_review_id AND x.reaction_type = 'report'), 0)::BIGINT AS report_count,
        v_delta AS xp_delta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_aura_for_search(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_signal_bounties(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_faculty_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_community_faculty_review(TEXT, BIGINT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB, TEXT[], TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_review_reaction(BIGINT, TEXT, TEXT, TEXT) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
