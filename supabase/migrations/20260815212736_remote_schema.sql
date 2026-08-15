-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE TABLE public.comments (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name         text                     NOT NULL,
  message      text,
  status       text                     DEFAULT 'pending'::text,
  spam_score   integer                  DEFAULT 0,
  report_count integer                  DEFAULT 0,
  created_at   timestamp with time zone DEFAULT now()
);

ALTER TABLE public.comments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comments
  ADD CONSTRAINT comment_pkey PRIMARY KEY (id);

ALTER TABLE public.comments
  ADD CONSTRAINT comments_message_length_check CHECK (char_length(TRIM(BOTH FROM message)) >= 3 AND char_length(TRIM(BOTH FROM message)) <= 500);

ALTER TABLE public.comments
  ADD CONSTRAINT comments_name_length_check CHECK (char_length(TRIM(BOTH FROM name)) >= 2 AND char_length(TRIM(BOTH FROM name)) <= 30);

ALTER TABLE public.comments
  ADD CONSTRAINT comments_report_count_check CHECK (report_count >= 0);

ALTER TABLE public.comments
  ADD CONSTRAINT comments_spam_score_check CHECK (spam_score >= 0);

ALTER TABLE public.comments
  ADD CONSTRAINT comments_status_check CHECK (status = ANY (ARRAY['approved'::text, 'pending'::text, 'blocked'::text]));

GRANT SELECT ON public.comments TO anon;

GRANT SELECT ON public.comments TO authenticated;

GRANT ALL ON public.comments TO service_role;

CREATE POLICY "Public can read approved comments" ON public.comments
  FOR SELECT
  TO anon, authenticated
  USING ((status = 'approved'::text));

CREATE TABLE public.guestbook_rate_limits (
  id           bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  visitor_hash text                     NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.guestbook_rate_limits
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.guestbook_rate_limits
  ADD CONSTRAINT guestbook_rate_limits_pkey PRIMARY KEY (id);

GRANT ALL ON public.guestbook_rate_limits TO service_role;

CREATE INDEX guestbook_rate_limits_visitor_created_idx ON public.guestbook_rate_limits (visitor_hash, created_at DESC);
