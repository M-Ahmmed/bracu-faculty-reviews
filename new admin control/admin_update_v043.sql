-- BRACU Faculty Reviews Admin Control Room v0.4.3
-- Adds two owner-dashboard RPCs for deep user/activity analytics.
-- Run this in Supabase SQL Editor before deploying the new admin.html/css/js.

DROP FUNCTION IF EXISTS public.admin_get_control_room(DATE, DATE);
DROP FUNCTION IF EXISTS public.admin_get_user_control_room(TEXT, DATE, DATE);

CREATE OR REPLACE FUNCTION public.admin_get_control_room(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    output JSONB;
BEGIN
    WITH params AS (
        SELECT
            COALESCE(p_start_date, '2000-01-01'::DATE) AS start_date,
            COALESCE(p_end_date, (NOW() AT TIME ZONE 'Asia/Dhaka')::DATE) AS end_date
    ),
    profiles AS (
        SELECT
            sp.username,
            sp.full_email,
            sp.anonymous_handle,
            sp.first_name_guess,
            COALESCE(sp.is_email_verified, FALSE) AS is_email_verified,
            COALESCE(sp.handle_visible_public, FALSE) AS handle_visible_public,
            COALESCE(sp.advising_xp, 0) AS advising_xp,
            sp.first_seen,
            sp.last_visited_at,
            COALESCE(sp.total_visits, 0) AS lifetime_total_visits,
            sp.last_action,
            sp.last_action_at
        FROM public.student_profiles sp
        WHERE sp.username IS NOT NULL
    ),
    visit_agg AS (
        SELECT
            udv.username,
            SUM(udv.visit_count)::BIGINT AS visits,
            COUNT(DISTINCT udv.visit_date)::BIGINT AS active_days,
            MIN(udv.first_seen_at) AS first_seen_at,
            MAX(udv.last_seen_at) AS last_seen_at
        FROM public.user_daily_visits udv, params prm
        WHERE udv.visit_date BETWEEN prm.start_date AND prm.end_date
        GROUP BY udv.username
    ),
    activity_agg AS (
        SELECT
            uae.username,
            COUNT(*)::BIGINT AS total_events,
            COUNT(*) FILTER (WHERE uae.event_type = 'search')::BIGINT AS total_searches,
            COUNT(*) FILTER (
                WHERE uae.event_type = 'search'
                  AND COALESCE((uae.metadata ->> 'matched')::BOOLEAN, FALSE) = FALSE
            )::BIGINT AS failed_searches,
            COUNT(*) FILTER (WHERE uae.event_type IN ('vote', 'vote_removed'))::BIGINT AS vote_actions,
            COUNT(*) FILTER (WHERE uae.event_type ILIKE '%review%')::BIGINT AS review_actions,
            COUNT(*) FILTER (WHERE uae.event_type IN ('community_faculty_create'))::BIGINT AS page_actions,
            MAX(uae.created_at) AS last_action_time
        FROM public.user_activity_events uae, params prm
        WHERE (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
        GROUP BY uae.username
    ),
    community_review_agg AS (
        SELECT
            cfr.username,
            COUNT(*)::BIGINT AS community_reviews
        FROM public.community_faculty_reviews cfr, params prm
        WHERE (cfr.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
          AND COALESCE(cfr.is_hidden, FALSE) = FALSE
        GROUP BY cfr.username
    ),
    legacy_review_agg AS (
        SELECT
            COALESCE(sr.username, split_part(sr.student_email, '@', 1)) AS username,
            COUNT(*)::BIGINT AS legacy_reviews
        FROM public.student_reviews sr, params prm
        WHERE COALESCE(sr.username, split_part(sr.student_email, '@', 1)) IS NOT NULL
          AND (sr.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
        GROUP BY COALESCE(sr.username, split_part(sr.student_email, '@', 1))
    ),
    page_agg AS (
        SELECT
            cfp.added_by_username AS username,
            COUNT(*)::BIGINT AS pages_added
        FROM public.community_faculty_profiles cfp, params prm
        WHERE (cfp.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
          AND COALESCE(cfp.is_hidden, FALSE) = FALSE
        GROUP BY cfp.added_by_username
    ),
    credit_agg AS (
        SELECT
            uce.username,
            COALESCE(SUM(uce.points), 0)::BIGINT AS aura_earned_range,
            COUNT(*)::BIGINT AS aura_events
        FROM public.user_credit_events uce, params prm
        WHERE (uce.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
        GROUP BY uce.username
    ),
    reactions_made AS (
        SELECT
            rr.username,
            COUNT(*)::BIGINT AS reactions_made,
            COUNT(*) FILTER (WHERE rr.reaction_type = 'helpful')::BIGINT AS agrees_made,
            COUNT(*) FILTER (WHERE rr.reaction_type = 'not_useful')::BIGINT AS disagrees_made,
            COUNT(*) FILTER (WHERE rr.reaction_type = 'report')::BIGINT AS reports_made
        FROM public.review_reactions rr, params prm
        WHERE (rr.updated_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
        GROUP BY rr.username
    ),
    reactions_received AS (
        SELECT
            cfr.username,
            COUNT(*)::BIGINT AS reactions_received,
            COUNT(*) FILTER (WHERE rr.reaction_type = 'helpful')::BIGINT AS helpful_received,
            COUNT(*) FILTER (WHERE rr.reaction_type = 'not_useful')::BIGINT AS not_useful_received,
            COUNT(*) FILTER (WHERE rr.reaction_type = 'report')::BIGINT AS reports_received
        FROM public.review_reactions rr
        JOIN public.community_faculty_reviews cfr ON cfr.id = rr.review_id
        JOIN params prm ON TRUE
        WHERE (rr.updated_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
          AND COALESCE(cfr.is_hidden, FALSE) = FALSE
        GROUP BY cfr.username
    ),
    users AS (
        SELECT
            pr.username,
            pr.full_email,
            pr.anonymous_handle,
            pr.first_name_guess,
            pr.is_email_verified,
            pr.handle_visible_public,
            pr.advising_xp,
            pr.first_seen,
            pr.last_visited_at,
            pr.lifetime_total_visits,
            pr.last_action,
            pr.last_action_at,
            COALESCE(va.visits, 0) AS visits,
            COALESCE(va.active_days, 0) AS active_days,
            va.first_seen_at,
            COALESCE(va.last_seen_at, pr.last_visited_at) AS last_seen_at,
            COALESCE(aa.total_events, 0) AS total_events,
            COALESCE(aa.total_searches, 0) AS total_searches,
            COALESCE(aa.failed_searches, 0) AS failed_searches,
            COALESCE(aa.vote_actions, 0) AS vote_actions,
            COALESCE(aa.review_actions, 0) AS review_actions,
            COALESCE(aa.page_actions, 0) AS page_actions,
            aa.last_action_time,
            COALESCE(cra.community_reviews, 0) + COALESCE(lra.legacy_reviews, 0) AS reviews,
            COALESCE(cra.community_reviews, 0) AS community_reviews,
            COALESCE(lra.legacy_reviews, 0) AS legacy_reviews,
            COALESCE(pa.pages_added, 0) AS pages_added,
            COALESCE(ca.aura_earned_range, 0) AS aura_earned_range,
            COALESCE(ca.aura_events, 0) AS aura_events,
            COALESCE(rm.reactions_made, 0) AS reactions_made,
            COALESCE(rm.agrees_made, 0) AS agrees_made,
            COALESCE(rm.disagrees_made, 0) AS disagrees_made,
            COALESCE(rm.reports_made, 0) AS reports_made,
            COALESCE(rrx.reactions_received, 0) AS reactions_received,
            COALESCE(rrx.helpful_received, 0) AS helpful_received,
            COALESCE(rrx.not_useful_received, 0) AS not_useful_received,
            COALESCE(rrx.reports_received, 0) AS reports_received
        FROM profiles pr
        LEFT JOIN visit_agg va ON va.username = pr.username
        LEFT JOIN activity_agg aa ON aa.username = pr.username
        LEFT JOIN community_review_agg cra ON cra.username = pr.username
        LEFT JOIN legacy_review_agg lra ON lra.username = pr.username
        LEFT JOIN page_agg pa ON pa.username = pr.username
        LEFT JOIN credit_agg ca ON ca.username = pr.username
        LEFT JOIN reactions_made rm ON rm.username = pr.username
        LEFT JOIN reactions_received rrx ON rrx.username = pr.username
    ),
    active_users AS (
        SELECT *
        FROM users u, params prm
        WHERE prm.start_date = '2000-01-01'::DATE
           OR u.visits > 0
           OR u.total_events > 0
           OR u.reviews > 0
           OR u.pages_added > 0
           OR u.aura_events > 0
           OR u.reactions_made > 0
           OR u.reactions_received > 0
           OR (u.first_seen AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
    ),
    stats AS (
        SELECT jsonb_build_object(
            'users', COUNT(*)::BIGINT,
            'visits', COALESCE(SUM(visits), 0)::BIGINT,
            'active_days', COALESCE(SUM(active_days), 0)::BIGINT,
            'searches', COALESCE(SUM(total_searches), 0)::BIGINT,
            'failed_searches', COALESCE(SUM(failed_searches), 0)::BIGINT,
            'reviews', COALESCE(SUM(reviews), 0)::BIGINT,
            'community_reviews', COALESCE(SUM(community_reviews), 0)::BIGINT,
            'legacy_reviews', COALESCE(SUM(legacy_reviews), 0)::BIGINT,
            'pages_added', COALESCE(SUM(pages_added), 0)::BIGINT,
            'aura_earned', COALESCE(SUM(aura_earned_range), 0)::BIGINT,
            'reactions', COALESCE(SUM(reactions_made), 0)::BIGINT,
            'helpful_received', COALESCE(SUM(helpful_received), 0)::BIGINT,
            'reports_received', COALESCE(SUM(reports_received), 0)::BIGINT
        ) AS payload
        FROM active_users
    ),
    failed_searches AS (
        SELECT
            regexp_replace(upper(COALESCE(uae.target_id, uae.event_label, '')), '[^A-Z0-9]', '', 'g') AS query,
            COUNT(*)::BIGINT AS total_searches,
            COUNT(DISTINCT uae.username)::BIGINT AS unique_students,
            MAX(uae.created_at) AS last_searched_at
        FROM public.user_activity_events uae, params prm
        WHERE uae.event_type = 'search'
          AND COALESCE((uae.metadata ->> 'matched')::BOOLEAN, FALSE) = FALSE
          AND (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
          AND length(regexp_replace(upper(COALESCE(uae.target_id, uae.event_label, '')), '[^A-Z0-9]', '', 'g')) >= 2
        GROUP BY regexp_replace(upper(COALESCE(uae.target_id, uae.event_label, '')), '[^A-Z0-9]', '', 'g')
        ORDER BY COUNT(DISTINCT uae.username) DESC, COUNT(*) DESC, MAX(uae.created_at) DESC
        LIMIT 20
    ),
    recent_reviews AS (
        SELECT
            cfr.id,
            cfr.username,
            cfr.target_type,
            cfr.community_faculty_id,
            cfr.archive_faculty_id,
            CASE
                WHEN cfr.target_type = 'community' THEN COALESCE(cfp.faculty_name, cfp.faculty_initial)
                ELSE split_part(fr.faculty_reviews, '|', 1)
            END AS faculty_label,
            cfr.course_code,
            ROUND(((cfr.teaching_rating + cfr.marking_rating + cfr.behavior_rating) / 3.0)::NUMERIC, 1) AS avg_rating,
            cfr.created_at
        FROM public.community_faculty_reviews cfr
        LEFT JOIN public.community_faculty_profiles cfp ON cfp.id = cfr.community_faculty_id
        LEFT JOIN public.faculty_reviews fr ON fr.id = cfr.archive_faculty_id
        JOIN params prm ON TRUE
        WHERE (cfr.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
          AND COALESCE(cfr.is_hidden, FALSE) = FALSE
        ORDER BY cfr.created_at DESC
        LIMIT 20
    ),
    recent_pages AS (
        SELECT
            cfp.id,
            cfp.faculty_initial,
            COALESCE(cfp.faculty_name, cfp.faculty_initial) AS faculty_label,
            cfp.department,
            cfp.course_codes,
            cfp.added_by_username,
            cfp.created_at,
            COALESCE((
                SELECT COUNT(*)
                FROM public.community_faculty_reviews r
                WHERE r.target_type = 'community'
                  AND r.community_faculty_id = cfp.id
                  AND COALESCE(r.is_hidden, FALSE) = FALSE
            ), 0)::BIGINT AS review_count
        FROM public.community_faculty_profiles cfp, params prm
        WHERE (cfp.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
          AND COALESCE(cfp.is_hidden, FALSE) = FALSE
        ORDER BY cfp.created_at DESC
        LIMIT 20
    )
    SELECT jsonb_build_object(
        'range', jsonb_build_object('start_date', (SELECT start_date FROM params), 'end_date', (SELECT end_date FROM params)),
        'stats', (SELECT payload FROM stats),
        'users', COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.last_seen_at DESC NULLS LAST) FROM active_users u), '[]'::jsonb),
        'top_failed_searches', COALESCE((SELECT jsonb_agg(to_jsonb(fs)) FROM failed_searches fs), '[]'::jsonb),
        'recent_reviews', COALESCE((SELECT jsonb_agg(to_jsonb(rr)) FROM recent_reviews rr), '[]'::jsonb),
        'recent_pages', COALESCE((SELECT jsonb_agg(to_jsonb(rp)) FROM recent_pages rp), '[]'::jsonb)
    )
    INTO output;

    RETURN output;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_control_room(
    p_username TEXT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
    v_email TEXT;
    output JSONB;
BEGIN
    v_username := lower(trim(COALESCE(p_username, '')));

    SELECT sp.full_email
    INTO v_email
    FROM public.student_profiles sp
    WHERE sp.username = v_username
    LIMIT 1;

    WITH params AS (
        SELECT
            COALESCE(p_start_date, '2000-01-01'::DATE) AS start_date,
            COALESCE(p_end_date, (NOW() AT TIME ZONE 'Asia/Dhaka')::DATE) AS end_date
    ),
    profile AS (
        SELECT
            sp.username,
            sp.full_email,
            sp.anonymous_handle,
            sp.first_name_guess,
            COALESCE(sp.is_email_verified, FALSE) AS is_email_verified,
            COALESCE(sp.handle_visible_public, FALSE) AS handle_visible_public,
            COALESCE(sp.advising_xp, 0) AS advising_xp,
            sp.first_seen,
            sp.last_visited_at,
            COALESCE(sp.total_visits, 0) AS total_visits,
            sp.last_action,
            sp.last_action_at
        FROM public.student_profiles sp
        WHERE sp.username = v_username
    ),
    range_stats AS (
        SELECT jsonb_build_object(
            'visits', COALESCE((SELECT SUM(udv.visit_count) FROM public.user_daily_visits udv, params prm WHERE udv.username = v_username AND udv.visit_date BETWEEN prm.start_date AND prm.end_date), 0),
            'active_days', COALESCE((SELECT COUNT(DISTINCT udv.visit_date) FROM public.user_daily_visits udv, params prm WHERE udv.username = v_username AND udv.visit_date BETWEEN prm.start_date AND prm.end_date), 0),
            'searches', COALESCE((SELECT COUNT(*) FROM public.user_activity_events uae, params prm WHERE uae.username = v_username AND uae.event_type = 'search' AND (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date), 0),
            'failed_searches', COALESCE((SELECT COUNT(*) FROM public.user_activity_events uae, params prm WHERE uae.username = v_username AND uae.event_type = 'search' AND COALESCE((uae.metadata ->> 'matched')::BOOLEAN, FALSE) = FALSE AND (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date), 0),
            'aura_earned', COALESCE((SELECT SUM(uce.points) FROM public.user_credit_events uce, params prm WHERE uce.username = v_username AND (uce.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date), 0),
            'reactions_made', COALESCE((SELECT COUNT(*) FROM public.review_reactions rr, params prm WHERE rr.username = v_username AND (rr.updated_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date), 0)
        ) AS payload
    ),
    lifetime AS (
        SELECT jsonb_build_object(
            'reviews', COALESCE((SELECT COUNT(*) FROM public.community_faculty_reviews cfr WHERE (cfr.username = v_username OR cfr.student_email = v_email) AND COALESCE(cfr.is_hidden, FALSE) = FALSE), 0)
                       + COALESCE((SELECT COUNT(*) FROM public.student_reviews sr WHERE COALESCE(sr.username, split_part(sr.student_email, '@', 1)) = v_username), 0),
            'community_reviews', COALESCE((SELECT COUNT(*) FROM public.community_faculty_reviews cfr WHERE (cfr.username = v_username OR cfr.student_email = v_email) AND COALESCE(cfr.is_hidden, FALSE) = FALSE), 0),
            'legacy_reviews', COALESCE((SELECT COUNT(*) FROM public.student_reviews sr WHERE COALESCE(sr.username, split_part(sr.student_email, '@', 1)) = v_username), 0),
            'pages_added', COALESCE((SELECT COUNT(*) FROM public.community_faculty_profiles cfp WHERE (cfp.added_by_username = v_username OR cfp.added_by_email = v_email) AND COALESCE(cfp.is_hidden, FALSE) = FALSE), 0),
            'helpful_received', COALESCE((SELECT COUNT(*) FROM public.review_reactions rr JOIN public.community_faculty_reviews cfr ON cfr.id = rr.review_id WHERE rr.reaction_type = 'helpful' AND (cfr.username = v_username OR cfr.student_email = v_email) AND COALESCE(cfr.is_hidden, FALSE) = FALSE), 0),
            'not_useful_received', COALESCE((SELECT COUNT(*) FROM public.review_reactions rr JOIN public.community_faculty_reviews cfr ON cfr.id = rr.review_id WHERE rr.reaction_type = 'not_useful' AND (cfr.username = v_username OR cfr.student_email = v_email) AND COALESCE(cfr.is_hidden, FALSE) = FALSE), 0),
            'reports_received', COALESCE((SELECT COUNT(*) FROM public.review_reactions rr JOIN public.community_faculty_reviews cfr ON cfr.id = rr.review_id WHERE rr.reaction_type = 'report' AND (cfr.username = v_username OR cfr.student_email = v_email) AND COALESCE(cfr.is_hidden, FALSE) = FALSE), 0),
            'credit_events', COALESCE((SELECT COUNT(*) FROM public.user_credit_events uce WHERE uce.username = v_username), 0)
        ) AS payload
    )
    SELECT jsonb_build_object(
        'range', jsonb_build_object('start_date', (SELECT start_date FROM params), 'end_date', (SELECT end_date FROM params)),
        'profile', COALESCE((SELECT to_jsonb(p) FROM profile p), '{}'::jsonb),
        'range_stats', (SELECT payload FROM range_stats),
        'lifetime', (SELECT payload FROM lifetime),
        'daily_visits', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.visit_date DESC)
            FROM (
                SELECT udv.*
                FROM public.user_daily_visits udv, params prm
                WHERE udv.username = v_username
                  AND udv.visit_date BETWEEN prm.start_date AND prm.end_date
                ORDER BY udv.visit_date DESC
                LIMIT 120
            ) x
        ), '[]'::jsonb),
        'searches', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
            FROM (
                SELECT
                    (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE AS activity_date,
                    uae.target_type AS search_type,
                    uae.target_id AS search_query,
                    uae.event_label,
                    COALESCE((uae.metadata ->> 'matched')::BOOLEAN, FALSE) AS matched,
                    uae.metadata,
                    uae.created_at
                FROM public.user_activity_events uae, params prm
                WHERE uae.username = v_username
                  AND uae.event_type = 'search'
                  AND (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY uae.created_at DESC
                LIMIT 500
            ) x
        ), '[]'::jsonb),
        'community_reviews', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC)
            FROM (
                SELECT
                    cfr.id,
                    cfr.target_type,
                    cfr.community_faculty_id,
                    cfr.archive_faculty_id,
                    CASE WHEN cfr.target_type = 'community' THEN COALESCE(cfp.faculty_name, cfp.faculty_initial) ELSE split_part(fr.faculty_reviews, '|', 1) END AS faculty_label,
                    CASE WHEN cfr.target_type = 'community' THEN cfp.faculty_initial ELSE split_part(fr.faculty_reviews, '|', 2) END AS faculty_initial,
                    cfr.course_code,
                    cfr.teaching_rating,
                    cfr.marking_rating,
                    cfr.behavior_rating,
                    ROUND(((cfr.teaching_rating + cfr.marking_rating + cfr.behavior_rating) / 3.0)::NUMERIC, 1) AS avg_rating,
                    cfr.selected_tags,
                    cfr.tag_labels,
                    cfr.generated_summary,
                    cfr.personal_note,
                    cfr.is_hidden,
                    cfr.created_at,
                    cfr.updated_at,
                    COALESCE((SELECT COUNT(*) FROM public.review_reactions rr WHERE rr.review_id = cfr.id AND rr.reaction_type = 'helpful'), 0) AS helpful_count,
                    COALESCE((SELECT COUNT(*) FROM public.review_reactions rr WHERE rr.review_id = cfr.id AND rr.reaction_type = 'not_useful'), 0) AS not_useful_count,
                    COALESCE((SELECT COUNT(*) FROM public.review_reactions rr WHERE rr.review_id = cfr.id AND rr.reaction_type = 'report'), 0) AS report_count
                FROM public.community_faculty_reviews cfr
                LEFT JOIN public.community_faculty_profiles cfp ON cfp.id = cfr.community_faculty_id
                LEFT JOIN public.faculty_reviews fr ON fr.id = cfr.archive_faculty_id
                JOIN params prm ON TRUE
                WHERE (cfr.username = v_username OR cfr.student_email = v_email)
                  AND (cfr.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY cfr.updated_at DESC
                LIMIT 200
            ) x
        ), '[]'::jsonb),
        'legacy_reviews', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
            FROM (
                SELECT
                    sr.id,
                    sr.faculty_id,
                    split_part(fr.faculty_reviews, '|', 1) AS faculty_name,
                    sr.course_code,
                    sr.teaching_rating,
                    sr.marking_rating,
                    sr.behavior_rating,
                    ROUND(((sr.teaching_rating + sr.marking_rating + sr.behavior_rating) / 3.0)::NUMERIC, 1) AS avg_rating,
                    sr.raw_feedback,
                    sr.created_at,
                    sr.updated_at
                FROM public.student_reviews sr
                LEFT JOIN public.faculty_reviews fr ON fr.id = sr.faculty_id
                JOIN params prm ON TRUE
                WHERE COALESCE(sr.username, split_part(sr.student_email, '@', 1)) = v_username
                  AND (sr.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY sr.created_at DESC
                LIMIT 200
            ) x
        ), '[]'::jsonb),
        'pages_added', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
            FROM (
                SELECT
                    cfp.id,
                    cfp.faculty_initial,
                    COALESCE(cfp.faculty_name, cfp.faculty_initial) AS faculty_label,
                    cfp.faculty_name,
                    cfp.department,
                    cfp.course_codes,
                    cfp.is_hidden,
                    cfp.created_at,
                    cfp.updated_at,
                    COALESCE((SELECT COUNT(*) FROM public.community_faculty_reviews r WHERE r.target_type = 'community' AND r.community_faculty_id = cfp.id AND COALESCE(r.is_hidden, FALSE) = FALSE), 0) AS review_count
                FROM public.community_faculty_profiles cfp
                JOIN params prm ON TRUE
                WHERE (cfp.added_by_username = v_username OR cfp.added_by_email = v_email)
                  AND (cfp.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY cfp.created_at DESC
                LIMIT 200
            ) x
        ), '[]'::jsonb),
        'credit_events', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
            FROM (
                SELECT
                    uce.id,
                    uce.points,
                    uce.reason,
                    CASE
                        WHEN uce.reason = 'community_verdict_unlocked' THEN 'Community Verdict unlocked'
                        WHEN uce.reason = 'faculty_page_added' THEN 'Missing page started'
                        WHEN uce.reason = 'review_submitted' THEN 'Review submitted'
                        WHEN uce.reason = 'daily_meaningful_visit' THEN 'Daily visit'
                        WHEN uce.reason = 'unique_search' THEN 'Unique search'
                        WHEN uce.reason LIKE 'review_reaction_%' THEN 'Review reaction'
                        ELSE uce.reason
                    END AS reason_label,
                    uce.source_type,
                    uce.source_id,
                    uce.metadata,
                    uce.created_at
                FROM public.user_credit_events uce, params prm
                WHERE uce.username = v_username
                  AND (uce.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY uce.created_at DESC
                LIMIT 300
            ) x
        ), '[]'::jsonb),
        'notifications', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
            FROM (
                SELECT un.*
                FROM public.user_notifications un, params prm
                WHERE un.username = v_username
                  AND (un.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY un.created_at DESC
                LIMIT 300
            ) x
        ), '[]'::jsonb),
        'reactions_made', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC)
            FROM (
                SELECT
                    rr.*,
                    CASE WHEN cfr.target_type = 'community' THEN COALESCE(cfp.faculty_name, cfp.faculty_initial) ELSE split_part(fr.faculty_reviews, '|', 1) END AS faculty_label,
                    cfr.course_code
                FROM public.review_reactions rr
                JOIN public.community_faculty_reviews cfr ON cfr.id = rr.review_id
                LEFT JOIN public.community_faculty_profiles cfp ON cfp.id = cfr.community_faculty_id
                LEFT JOIN public.faculty_reviews fr ON fr.id = cfr.archive_faculty_id
                JOIN params prm ON TRUE
                WHERE rr.username = v_username
                  AND (rr.updated_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY rr.updated_at DESC
                LIMIT 300
            ) x
        ), '[]'::jsonb),
        'reactions_received', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC)
            FROM (
                SELECT
                    rr.id,
                    rr.review_id,
                    rr.reaction_type,
                    rr.username AS reacted_by,
                    rr.student_email AS reacted_by_email,
                    rr.created_at,
                    rr.updated_at,
                    cfr.course_code,
                    CASE WHEN cfr.target_type = 'community' THEN COALESCE(cfp.faculty_name, cfp.faculty_initial) ELSE split_part(fr.faculty_reviews, '|', 1) END AS faculty_label
                FROM public.review_reactions rr
                JOIN public.community_faculty_reviews cfr ON cfr.id = rr.review_id
                LEFT JOIN public.community_faculty_profiles cfp ON cfp.id = cfr.community_faculty_id
                LEFT JOIN public.faculty_reviews fr ON fr.id = cfr.archive_faculty_id
                JOIN params prm ON TRUE
                WHERE (cfr.username = v_username OR cfr.student_email = v_email)
                  AND (rr.updated_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY rr.updated_at DESC
                LIMIT 300
            ) x
        ), '[]'::jsonb),
        'current_votes', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC)
            FROM (
                SELECT
                    uvs.faculty_id,
                    split_part(fr.faculty_reviews, '|', 1) AS faculty_name,
                    uvs.vote_type,
                    uvs.first_voted_at,
                    uvs.updated_at
                FROM public.user_vote_state uvs
                LEFT JOIN public.faculty_reviews fr ON fr.id = uvs.faculty_id
                WHERE uvs.username = v_username
                  AND uvs.vote_type IN ('up', 'down')
                ORDER BY uvs.updated_at DESC
                LIMIT 300
            ) x
        ), '[]'::jsonb),
        'timeline', COALESCE((
            SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
            FROM (
                SELECT
                    (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE AS activity_date,
                    uae.event_type,
                    uae.target_type,
                    uae.target_id,
                    uae.event_label,
                    uae.metadata,
                    uae.created_at
                FROM public.user_activity_events uae, params prm
                WHERE uae.username = v_username
                  AND (uae.created_at AT TIME ZONE 'Asia/Dhaka')::DATE BETWEEN prm.start_date AND prm.end_date
                ORDER BY uae.created_at DESC
                LIMIT 700
            ) x
        ), '[]'::jsonb)
    )
    INTO output;

    RETURN output;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_control_room(DATE, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_control_room(TEXT, DATE, DATE) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
