-- BRACU Faculty Reviews v0.5.4
-- Notification click resolver hotfix.
-- Fixes: profile notification click saying "Notification target is not available yet".
-- Safe patch: no table drops, no data loss.

CREATE OR REPLACE FUNCTION public.resolve_my_notification_target(
    p_username TEXT,
    p_full_email TEXT,
    p_notification_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
    v_email TEXT;
    n RECORD;
    v_source_type TEXT;
    v_source_id TEXT;
    v_id BIGINT;
    cr RECORD;
    sr RECORD;
BEGIN
    v_email := lower(trim(COALESCE(p_full_email, '')));
    v_username := lower(trim(COALESCE(p_username, split_part(v_email, '@', 1))));

    IF v_username = '' OR p_notification_id IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'missing_user_or_notification');
    END IF;

    SELECT * INTO n
    FROM public.user_notifications un
    WHERE un.id = p_notification_id
      AND un.username = v_username
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'notification_not_found');
    END IF;

    UPDATE public.user_notifications
    SET is_read = TRUE
    WHERE id = n.id
      AND username = v_username;

    v_source_type := lower(trim(COALESCE(n.source_type, 'site')));
    v_source_id := NULLIF(trim(COALESCE(n.source_id, '')), '');

    IF v_source_id IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_target');
    END IF;

    -- Community faculty page notifications store the page id directly.
    IF v_source_type IN (
        'community_faculty',
        'community_faculty_request',
        'community_faculty_watch',
        'community_faculty_milestone'
    ) THEN
        IF v_source_id ~ '^[0-9]+$' THEN
            RETURN jsonb_build_object(
                'ok', TRUE,
                'target_type', 'community',
                'community_faculty_id', v_source_id::BIGINT,
                'source_type', v_source_type
            );
        END IF;

        RETURN jsonb_build_object(
            'ok', TRUE,
            'target_type', 'search',
            'search_query', v_source_id,
            'source_type', v_source_type
        );
    END IF;

    -- Community review notifications store the review id. Resolve it server-side
    -- so frontend does not depend on public views/RLS to discover the page.
    IF v_source_type = 'community_review' THEN
        IF v_source_id !~ '^[0-9]+$' THEN
            RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_review_id');
        END IF;

        v_id := v_source_id::BIGINT;

        SELECT
            r.id,
            r.target_type,
            r.community_faculty_id,
            r.archive_faculty_id
        INTO cr
        FROM public.community_faculty_reviews r
        WHERE r.id = v_id
          AND COALESCE(r.is_hidden, FALSE) = FALSE
        LIMIT 1;

        IF FOUND THEN
            IF cr.target_type = 'community' THEN
                RETURN jsonb_build_object(
                    'ok', TRUE,
                    'target_type', 'community',
                    'community_faculty_id', cr.community_faculty_id,
                    'review_id', cr.id,
                    'source_type', v_source_type
                );
            END IF;

            IF cr.target_type = 'archive' THEN
                RETURN jsonb_build_object(
                    'ok', TRUE,
                    'target_type', 'archive',
                    'archive_faculty_id', cr.archive_faculty_id,
                    'review_id', cr.id,
                    'source_type', v_source_type
                );
            END IF;
        END IF;

        RETURN jsonb_build_object('ok', FALSE, 'reason', 'review_target_not_found');
    END IF;

    -- Archive faculty notifications store the faculty id directly.
    IF v_source_type IN ('faculty', 'archive_faculty') THEN
        IF v_source_id ~ '^[0-9]+$' THEN
            RETURN jsonb_build_object(
                'ok', TRUE,
                'target_type', 'archive',
                'archive_faculty_id', v_source_id::BIGINT,
                'source_type', v_source_type
            );
        END IF;

        RETURN jsonb_build_object(
            'ok', TRUE,
            'target_type', 'search',
            'search_query', v_source_id,
            'source_type', v_source_type
        );
    END IF;

    -- Legacy student review notification, if any, stores student_reviews.id.
    IF v_source_type IN ('student_review', 'legacy_review') THEN
        IF v_source_id !~ '^[0-9]+$' THEN
            RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_legacy_review_id');
        END IF;

        SELECT r.id, r.faculty_id INTO sr
        FROM public.student_reviews r
        WHERE r.id = v_source_id::BIGINT
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'ok', TRUE,
                'target_type', 'archive',
                'archive_faculty_id', sr.faculty_id,
                'legacy_review_id', sr.id,
                'source_type', v_source_type
            );
        END IF;

        RETURN jsonb_build_object('ok', FALSE, 'reason', 'legacy_review_not_found');
    END IF;

    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unsupported_source_type', 'source_type', v_source_type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_my_notification_target(TEXT, TEXT, BIGINT) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
