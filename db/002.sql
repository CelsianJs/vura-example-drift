CREATE TABLE IF NOT EXISTS drift_demo.admission (id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false, day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date), creations integer NOT NULL DEFAULT 0 CHECK(creations>=0));
-- statement-breakpoint
INSERT INTO drift_demo.admission(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION drift_demo.create_workspace(p_id uuid,p_token text,p_csrf_hash text,p_csrf text,p_seed jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE gate drift_demo.admission%ROWTYPE; today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO gate FROM drift_demo.admission WHERE id=1 FOR UPDATE;
  IF NOT FOUND OR NOT gate.enabled THEN RAISE EXCEPTION USING ERRCODE='VQ001', MESSAGE='CANARY_CLOSED'; END IF;
  IF p_seed IS NULL OR jsonb_typeof(p_seed)<>'array' OR jsonb_array_length(p_seed) NOT BETWEEN 1 AND 10 OR octet_length(p_seed::text)>8192 THEN RAISE EXCEPTION USING ERRCODE='VQ004', MESSAGE='INVALID_SEED'; END IF;
  DELETE FROM drift_demo.workspaces WHERE id IN (
    SELECT w.id FROM drift_demo.workspaces w
    WHERE NOT EXISTS(SELECT 1 FROM drift_demo.sessions s WHERE s.workspace_id=w.id AND s.expires_at>now())
      AND (w.created_at<now()-interval '7 days' OR EXISTS(SELECT 1 FROM drift_demo.sessions s WHERE s.workspace_id=w.id AND s.expires_at<=now()))
    ORDER BY w.created_at,w.id LIMIT 25 FOR UPDATE OF w SKIP LOCKED
  );
  IF (SELECT count(*) FROM drift_demo.workspaces)>=100 THEN RAISE EXCEPTION USING ERRCODE='VQ002', MESSAGE='CANARY_CAPACITY'; END IF;
  IF gate.day=today AND gate.creations>=100 THEN RAISE EXCEPTION USING ERRCODE='VQ003', MESSAGE='CANARY_DAILY_LIMIT'; END IF;
  UPDATE drift_demo.admission SET day=today, creations=CASE WHEN day=today THEN creations+1 ELSE 1 END WHERE id=1;
  INSERT INTO drift_demo.workspaces(id) VALUES(p_id);
  INSERT INTO drift_demo.sessions(token_hash,workspace_id,csrf_hash,csrf_token,expires_at) VALUES(p_token,p_id,p_csrf_hash,p_csrf,now()+interval '7 days');
  INSERT INTO drift_demo.items(workspace_id,id,data) SELECT p_id,item->>'id',item FROM jsonb_array_elements(p_seed) item;
  RETURN p_id;
END;
$function$;
-- statement-breakpoint
REVOKE ALL ON FUNCTION drift_demo.create_workspace(uuid,text,text,text,jsonb) FROM PUBLIC;
