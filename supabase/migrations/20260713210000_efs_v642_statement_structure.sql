-- =============================================================================
-- EFS V6.4.2 Phase C1 — Financial Statement Structure
-- Hierarchy + disclosure scaffolds + attachment points
-- Additive only. Does NOT alter Statement Engine, Facts Adapter, Snapshots,
-- Accounting, Reports, Payroll, or Assets.
-- Nothing attaches directly to Statement Instances (enforced).
-- =============================================================================

-- ── 1. Framework-neutral Statement Structure ─────────────────────────────────
-- Neutral codes are stable attachment targets. Framework packs map presentation
-- via existing efs_taxonomy_lines / Framework Mapping (unchanged).

CREATE TABLE IF NOT EXISTS efs_structure_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_code text NOT NULL UNIQUE,
  statement_type text NOT NULL
    CHECK (statement_type IN (
      'financial_position',
      'financial_performance',
      'cash_flows',
      'changes_in_equity'
    )),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'deprecated')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS efs_structure_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES efs_structure_statements(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'deprecated')),
  UNIQUE (statement_id, section_code)
);

CREATE TABLE IF NOT EXISTS efs_structure_subsections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES efs_structure_sections(id) ON DELETE CASCADE,
  subsection_code text NOT NULL,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'deprecated')),
  UNIQUE (section_id, subsection_code)
);

CREATE TABLE IF NOT EXISTS efs_structure_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsection_id uuid REFERENCES efs_structure_subsections(id) ON DELETE CASCADE,
  section_id uuid REFERENCES efs_structure_sections(id) ON DELETE CASCADE,
  line_item_code text NOT NULL,
  name text NOT NULL,
  amount_basis text NOT NULL DEFAULT 'balance'
    CHECK (amount_basis IN ('balance', 'activity', 'cash_flow', 'derived')),
  is_total boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100,
  -- Optional bridge to Phase B taxonomy line_code (presentation mapping remains Framework Mapping)
  taxonomy_line_code text,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'deprecated')),
  CHECK (subsection_id IS NOT NULL OR section_id IS NOT NULL),
  UNIQUE (line_item_code)
);

-- Unified Statement Node hierarchy (canonical attachment address)
CREATE TABLE IF NOT EXISTS efs_structure_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_code text NOT NULL UNIQUE,
  node_kind text NOT NULL
    CHECK (node_kind IN (
      'statement',
      'section',
      'subsection',
      'line_item'
    )),
  parent_id uuid REFERENCES efs_structure_nodes(id) ON DELETE CASCADE,
  statement_id uuid REFERENCES efs_structure_statements(id) ON DELETE CASCADE,
  section_id uuid REFERENCES efs_structure_sections(id) ON DELETE CASCADE,
  subsection_id uuid REFERENCES efs_structure_subsections(id) ON DELETE CASCADE,
  line_item_id uuid REFERENCES efs_structure_line_items(id) ON DELETE CASCADE,
  depth int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 100,
  path text NOT NULL,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'deprecated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (node_kind = 'statement' AND statement_id IS NOT NULL) OR
    (node_kind = 'section' AND section_id IS NOT NULL) OR
    (node_kind = 'subsection' AND subsection_id IS NOT NULL) OR
    (node_kind = 'line_item' AND line_item_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_efs_structure_nodes_parent ON efs_structure_nodes (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_efs_structure_nodes_path ON efs_structure_nodes (path);

-- Presentation overlay: framework pack labels for neutral nodes (does not mutate hierarchy)
CREATE TABLE IF NOT EXISTS efs_structure_node_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id) ON DELETE CASCADE,
  structure_node_id uuid NOT NULL REFERENCES efs_structure_nodes(id) ON DELETE CASCADE,
  label text NOT NULL,
  UNIQUE (framework_pack_id, structure_node_id)
);

-- ── 2. Disclosure Structure (placeholders only — no content engines) ─────────
CREATE TABLE IF NOT EXISTS efs_disclosure_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_code text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_id uuid REFERENCES efs_disclosure_nodes(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'deprecated')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS efs_disclosure_placeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_node_id uuid NOT NULL REFERENCES efs_disclosure_nodes(id) ON DELETE CASCADE,
  placeholder_code text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'active', 'deprecated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (disclosure_node_id, placeholder_code)
);

CREATE TABLE IF NOT EXISTS efs_disclosure_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_node_id uuid NOT NULL REFERENCES efs_disclosure_nodes(id) ON DELETE CASCADE,
  structure_node_id uuid NOT NULL REFERENCES efs_structure_nodes(id) ON DELETE CASCADE,
  reference_role text NOT NULL DEFAULT 'related_line'
    CHECK (reference_role IN ('related_line', 'related_section', 'related_statement', 'cross_ref')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (disclosure_node_id, structure_node_id, reference_role)
);

-- ── 3. Attachment Points (capabilities reserved — no WP/Lead/etc. bodies) ────
-- HARD RULE: attach to structure_node_id and/or disclosure_node_id only.
-- statement_instance_id is FORBIDDEN (column absent by design).

CREATE TABLE IF NOT EXISTS efs_attachment_point_kinds (
  kind_code text PRIMARY KEY,
  label text NOT NULL,
  capability_phase text NOT NULL
    CHECK (capability_phase IN ('C', 'D', 'future')),
  description text NOT NULL
);

INSERT INTO efs_attachment_point_kinds (kind_code, label, capability_phase, description) VALUES
  ('working_paper', 'Working Paper', 'C', 'Future WP attaches to structure/disclosure node — never Statement Instance'),
  ('lead_schedule', 'Lead Schedule', 'C', 'Future Lead Schedule attachment point'),
  ('supporting_evidence', 'Supporting Evidence', 'C', 'Future evidence link attachment point'),
  ('review_comment', 'Review Comment', 'D', 'Future review comment attachment point'),
  ('validation_result', 'Validation Result', 'D', 'Future validation finding attachment point'),
  ('cross_reference', 'Cross Reference', 'C', 'Future cross-reference attachment point'),
  ('note_placeholder', 'Note Placeholder', 'C', 'Future note attachment point'),
  ('publication_anchor', 'Publication Anchor', 'D', 'Future publication pack structure anchor')
ON CONFLICT (kind_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS efs_attachment_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_code text NOT NULL REFERENCES efs_attachment_point_kinds(kind_code),
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE CASCADE,
  disclosure_node_id uuid REFERENCES efs_disclosure_nodes(id) ON DELETE CASCADE,
  -- Reserved for future artefact FKs (null until capability phases land)
  reserved_artefact_ref uuid,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reserved', 'bound', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_attachment_points_target_chk CHECK (
    structure_node_id IS NOT NULL OR disclosure_node_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_attachment_points_structure_kind
  ON efs_attachment_points (structure_node_id, kind_code)
  WHERE structure_node_id IS NOT NULL AND reserved_artefact_ref IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_attachment_points_disclosure_kind
  ON efs_attachment_points (disclosure_node_id, kind_code)
  WHERE disclosure_node_id IS NOT NULL AND reserved_artefact_ref IS NULL;

CREATE INDEX IF NOT EXISTS idx_efs_attachment_points_structure
  ON efs_attachment_points (structure_node_id, kind_code);
CREATE INDEX IF NOT EXISTS idx_efs_attachment_points_disclosure
  ON efs_attachment_points (disclosure_node_id, kind_code);

-- Guard: reject any attempt to store statement_instance attachment via misuse of reserved_artefact_ref metadata
CREATE TABLE IF NOT EXISTS efs_attachment_forbidden_targets (
  target_kind text PRIMARY KEY,
  rationale text NOT NULL
);

INSERT INTO efs_attachment_forbidden_targets (target_kind, rationale) VALUES
  ('statement_instance', 'V6.4.2: Nothing may attach directly to Statement Instances; attach to Structure Nodes only'),
  ('live_gl_account', 'Attachments are statutory structure concerns; live GL remains Accounting'),
  ('operational_report', 'Operational Reports are dual-track and outside statutory attachment model')
ON CONFLICT (target_kind) DO NOTHING;

-- ── Immutability for published structure hierarchy ───────────────────────────
CREATE OR REPLACE FUNCTION efs_protect_published_structure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'deprecated') THEN
      RAISE EXCEPTION 'EFS_STRUCTURE_IMMUTABLE: cannot delete published/deprecated %', TG_TABLE_NAME
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('published', 'deprecated') THEN
    IF TG_TABLE_NAME = 'efs_structure_nodes' THEN
      IF NEW.node_code IS DISTINCT FROM OLD.node_code
         OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
         OR NEW.node_kind IS DISTINCT FROM OLD.node_kind
         OR NEW.path IS DISTINCT FROM OLD.path
         OR NEW.statement_id IS DISTINCT FROM OLD.statement_id
         OR NEW.section_id IS DISTINCT FROM OLD.section_id
         OR NEW.subsection_id IS DISTINCT FROM OLD.subsection_id
         OR NEW.line_item_id IS DISTINCT FROM OLD.line_item_id
         OR NEW.depth IS DISTINCT FROM OLD.depth
         OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      THEN
        RAISE EXCEPTION 'EFS_STRUCTURE_IMMUTABLE: published structure node % cannot be rewritten', OLD.id
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.status NOT IN ('published', 'deprecated') THEN
        RAISE EXCEPTION 'EFS_STRUCTURE_IMMUTABLE: cannot regress node status on %', OLD.id
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      -- Published structural rows: only status may transition to deprecated
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status NOT IN ('published', 'deprecated', 'reserved') THEN
          RAISE EXCEPTION 'EFS_STRUCTURE_IMMUTABLE: cannot regress status on %', OLD.id
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
      IF to_jsonb(NEW) - 'status' IS DISTINCT FROM to_jsonb(OLD) - 'status' THEN
        RAISE EXCEPTION 'EFS_STRUCTURE_IMMUTABLE: published % row % cannot be rewritten', TG_TABLE_NAME, OLD.id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_structure_statements_immutable ON efs_structure_statements;
CREATE TRIGGER trg_efs_structure_statements_immutable
  BEFORE UPDATE OR DELETE ON efs_structure_statements
  FOR EACH ROW EXECUTE FUNCTION efs_protect_published_structure();

DROP TRIGGER IF EXISTS trg_efs_structure_sections_immutable ON efs_structure_sections;
CREATE TRIGGER trg_efs_structure_sections_immutable
  BEFORE UPDATE OR DELETE ON efs_structure_sections
  FOR EACH ROW EXECUTE FUNCTION efs_protect_published_structure();

DROP TRIGGER IF EXISTS trg_efs_structure_subsections_immutable ON efs_structure_subsections;
CREATE TRIGGER trg_efs_structure_subsections_immutable
  BEFORE UPDATE OR DELETE ON efs_structure_subsections
  FOR EACH ROW EXECUTE FUNCTION efs_protect_published_structure();

DROP TRIGGER IF EXISTS trg_efs_structure_line_items_immutable ON efs_structure_line_items;
CREATE TRIGGER trg_efs_structure_line_items_immutable
  BEFORE UPDATE OR DELETE ON efs_structure_line_items
  FOR EACH ROW EXECUTE FUNCTION efs_protect_published_structure();

DROP TRIGGER IF EXISTS trg_efs_structure_nodes_immutable ON efs_structure_nodes;
CREATE TRIGGER trg_efs_structure_nodes_immutable
  BEFORE UPDATE OR DELETE ON efs_structure_nodes
  FOR EACH ROW EXECUTE FUNCTION efs_protect_published_structure();

DROP TRIGGER IF EXISTS trg_efs_disclosure_nodes_immutable ON efs_disclosure_nodes;
CREATE TRIGGER trg_efs_disclosure_nodes_immutable
  BEFORE UPDATE OR DELETE ON efs_disclosure_nodes
  FOR EACH ROW EXECUTE FUNCTION efs_protect_published_structure();

-- ── Seed framework-neutral hierarchy (mirrors Phase B line codes as bridges) ─
DO $$
DECLARE
  st_sfp uuid; st_perf uuid; st_cf uuid; st_eq uuid;
  sec_assets uuid; sec_liab uuid; sec_equity uuid; sec_tot uuid;
  sec_rev uuid; sec_exp uuid; sec_res uuid;
  sec_op uuid; sec_inv uuid; sec_fin uuid; sec_cftot uuid;
  sec_open uuid; sec_mov uuid; sec_close uuid;
BEGIN
  INSERT INTO efs_structure_statements (statement_code, statement_type, name, sort_order)
  VALUES
    ('STMT.SFP', 'financial_position', 'Statement of Financial Position', 10),
    ('STMT.PERF', 'financial_performance', 'Statement of Financial Performance', 20),
    ('STMT.CF', 'cash_flows', 'Statement of Cash Flows', 30),
    ('STMT.EQUITY', 'changes_in_equity', 'Statement of Changes in Equity / Net Assets', 40)
  ON CONFLICT (statement_code) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO st_sfp FROM efs_structure_statements WHERE statement_code = 'STMT.SFP';
  SELECT id INTO st_perf FROM efs_structure_statements WHERE statement_code = 'STMT.PERF';
  SELECT id INTO st_cf FROM efs_structure_statements WHERE statement_code = 'STMT.CF';
  SELECT id INTO st_eq FROM efs_structure_statements WHERE statement_code = 'STMT.EQUITY';

  INSERT INTO efs_structure_sections (statement_id, section_code, name, sort_order) VALUES
    (st_sfp, 'SFP.ASSETS', 'Assets', 10),
    (st_sfp, 'SFP.LIABILITIES', 'Liabilities', 20),
    (st_sfp, 'SFP.EQUITY', 'Equity / Net Assets', 30),
    (st_sfp, 'SFP.TOTALS', 'Totals', 40),
    (st_perf, 'PERF.REVENUE', 'Revenue', 10),
    (st_perf, 'PERF.EXPENSES', 'Expenses', 20),
    (st_perf, 'PERF.RESULT', 'Result', 30),
    (st_cf, 'CF.OPERATING', 'Operating activities', 10),
    (st_cf, 'CF.INVESTING', 'Investing activities', 20),
    (st_cf, 'CF.FINANCING', 'Financing activities', 30),
    (st_cf, 'CF.TOTALS', 'Cash totals', 40),
    (st_eq, 'EQ.OPENING', 'Opening', 10),
    (st_eq, 'EQ.MOVEMENTS', 'Movements', 20),
    (st_eq, 'EQ.CLOSING', 'Closing', 30)
  ON CONFLICT (statement_id, section_code) DO NOTHING;

  SELECT id INTO sec_assets FROM efs_structure_sections WHERE section_code = 'SFP.ASSETS';
  SELECT id INTO sec_liab FROM efs_structure_sections WHERE section_code = 'SFP.LIABILITIES';
  SELECT id INTO sec_equity FROM efs_structure_sections WHERE section_code = 'SFP.EQUITY';
  SELECT id INTO sec_tot FROM efs_structure_sections WHERE section_code = 'SFP.TOTALS';
  SELECT id INTO sec_rev FROM efs_structure_sections WHERE section_code = 'PERF.REVENUE';
  SELECT id INTO sec_exp FROM efs_structure_sections WHERE section_code = 'PERF.EXPENSES';
  SELECT id INTO sec_res FROM efs_structure_sections WHERE section_code = 'PERF.RESULT';
  SELECT id INTO sec_op FROM efs_structure_sections WHERE section_code = 'CF.OPERATING';
  SELECT id INTO sec_inv FROM efs_structure_sections WHERE section_code = 'CF.INVESTING';
  SELECT id INTO sec_fin FROM efs_structure_sections WHERE section_code = 'CF.FINANCING';
  SELECT id INTO sec_cftot FROM efs_structure_sections WHERE section_code = 'CF.TOTALS';
  SELECT id INTO sec_open FROM efs_structure_sections WHERE section_code = 'EQ.OPENING';
  SELECT id INTO sec_mov FROM efs_structure_sections WHERE section_code = 'EQ.MOVEMENTS';
  SELECT id INTO sec_close FROM efs_structure_sections WHERE section_code = 'EQ.CLOSING';

  INSERT INTO efs_structure_subsections (section_id, subsection_code, name, sort_order) VALUES
    (sec_assets, 'SFP.ASSETS.MAIN', 'Assets', 10),
    (sec_liab, 'SFP.LIAB.MAIN', 'Liabilities', 10),
    (sec_equity, 'SFP.EQUITY.MAIN', 'Equity', 10),
    (sec_tot, 'SFP.TOTALS.MAIN', 'Statement totals', 10),
    (sec_rev, 'PERF.REV.MAIN', 'Revenue', 10),
    (sec_exp, 'PERF.EXP.MAIN', 'Expenses', 10),
    (sec_res, 'PERF.RES.MAIN', 'Period result', 10),
    (sec_op, 'CF.OP.MAIN', 'Operating', 10),
    (sec_inv, 'CF.INV.MAIN', 'Investing', 10),
    (sec_fin, 'CF.FIN.MAIN', 'Financing', 10),
    (sec_cftot, 'CF.TOT.MAIN', 'Net change', 10),
    (sec_open, 'EQ.OPEN.MAIN', 'Opening', 10),
    (sec_mov, 'EQ.MOV.MAIN', 'Movements', 10),
    (sec_close, 'EQ.CLOSE.MAIN', 'Closing', 10)
  ON CONFLICT (section_id, subsection_code) DO NOTHING;

  INSERT INTO efs_structure_line_items (subsection_id, line_item_code, name, amount_basis, is_total, sort_order, taxonomy_line_code)
  SELECT s.id, v.code, v.name, v.basis, v.is_total, v.sort_order, v.tax
  FROM (VALUES
    ('SFP.ASSETS.MAIN', 'LI.SFP.ASSETS', 'Assets', 'balance', false, 10, 'sfp.assets'),
    ('SFP.ASSETS.MAIN', 'LI.SFP.TOTAL_ASSETS', 'Total Assets', 'derived', true, 20, 'sfp.total_assets'),
    ('SFP.LIAB.MAIN', 'LI.SFP.LIABILITIES', 'Liabilities', 'balance', false, 10, 'sfp.liabilities'),
    ('SFP.LIAB.MAIN', 'LI.SFP.TOTAL_LIABILITIES', 'Total Liabilities', 'derived', true, 20, 'sfp.total_liabilities'),
    ('SFP.EQUITY.MAIN', 'LI.SFP.EQUITY', 'Equity', 'balance', false, 10, 'sfp.equity'),
    ('SFP.EQUITY.MAIN', 'LI.SFP.PERIOD_RESULT', 'Current period result', 'derived', false, 15, 'sfp.current_period_result'),
    ('SFP.EQUITY.MAIN', 'LI.SFP.TOTAL_EQUITY', 'Total Equity / Net Assets', 'derived', true, 20, 'sfp.total_equity'),
    ('SFP.TOTALS.MAIN', 'LI.SFP.TOTAL_LE', 'Total Liabilities and Equity', 'derived', true, 10, 'sfp.total_liabilities_and_equity'),
    ('PERF.REV.MAIN', 'LI.PERF.REVENUE', 'Revenue', 'activity', false, 10, 'perf.revenue'),
    ('PERF.REV.MAIN', 'LI.PERF.TOTAL_REVENUE', 'Total Revenue', 'derived', true, 20, 'perf.total_revenue'),
    ('PERF.EXP.MAIN', 'LI.PERF.EXPENSES', 'Expenses', 'activity', false, 10, 'perf.expenses'),
    ('PERF.EXP.MAIN', 'LI.PERF.TOTAL_EXPENSES', 'Total Expenses', 'derived', true, 20, 'perf.total_expenses'),
    ('PERF.RES.MAIN', 'LI.PERF.RESULT', 'Period result', 'derived', true, 10, 'perf.result'),
    ('CF.OP.MAIN', 'LI.CF.OPERATING', 'Operating activities', 'cash_flow', false, 10, 'cf.operating'),
    ('CF.INV.MAIN', 'LI.CF.INVESTING', 'Investing activities', 'cash_flow', false, 10, 'cf.investing'),
    ('CF.FIN.MAIN', 'LI.CF.FINANCING', 'Financing activities', 'cash_flow', false, 10, 'cf.financing'),
    ('CF.TOT.MAIN', 'LI.CF.NET', 'Net change in cash', 'derived', true, 10, 'cf.net_change'),
    ('EQ.OPEN.MAIN', 'LI.EQ.OPENING', 'Opening equity / net assets', 'balance', true, 10, 'eq.opening'),
    ('EQ.MOV.MAIN', 'LI.EQ.PERIOD_RESULT', 'Period result', 'derived', false, 10, 'eq.period_result'),
    ('EQ.MOV.MAIN', 'LI.EQ.OTHER', 'Other movements', 'activity', false, 20, 'eq.other_movements'),
    ('EQ.CLOSE.MAIN', 'LI.EQ.CLOSING', 'Closing equity / net assets', 'derived', true, 10, 'eq.closing')
  ) AS v(sub_code, code, name, basis, is_total, sort_order, tax)
  JOIN efs_structure_subsections s ON s.subsection_code = v.sub_code
  ON CONFLICT (line_item_code) DO UPDATE
    SET taxonomy_line_code = EXCLUDED.taxonomy_line_code, name = EXCLUDED.name;

  INSERT INTO efs_structure_nodes (node_code, node_kind, parent_id, statement_id, depth, sort_order, path)
  SELECT 'NODE.' || st.statement_code, 'statement', NULL, st.id, 0, st.sort_order, st.statement_code
  FROM efs_structure_statements st
  ON CONFLICT (node_code) DO NOTHING;

  INSERT INTO efs_structure_nodes (node_code, node_kind, parent_id, statement_id, section_id, depth, sort_order, path)
  SELECT
    'NODE.' || sec.section_code,
    'section',
    pn.id,
    sec.statement_id,
    sec.id,
    1,
    sec.sort_order,
    pn.path || '/' || sec.section_code
  FROM efs_structure_sections sec
  JOIN efs_structure_statements st ON st.id = sec.statement_id
  JOIN efs_structure_nodes pn ON pn.node_code = 'NODE.' || st.statement_code
  ON CONFLICT (node_code) DO NOTHING;

  INSERT INTO efs_structure_nodes (node_code, node_kind, parent_id, statement_id, section_id, subsection_id, depth, sort_order, path)
  SELECT
    'NODE.' || sub.subsection_code,
    'subsection',
    pn.id,
    sec.statement_id,
    sec.id,
    sub.id,
    2,
    sub.sort_order,
    pn.path || '/' || sub.subsection_code
  FROM efs_structure_subsections sub
  JOIN efs_structure_sections sec ON sec.id = sub.section_id
  JOIN efs_structure_nodes pn ON pn.node_code = 'NODE.' || sec.section_code
  ON CONFLICT (node_code) DO NOTHING;

  INSERT INTO efs_structure_nodes (node_code, node_kind, parent_id, statement_id, section_id, subsection_id, line_item_id, depth, sort_order, path)
  SELECT
    'NODE.' || li.line_item_code,
    'line_item',
    pn.id,
    sec.statement_id,
    COALESCE(li.section_id, sub.section_id),
    li.subsection_id,
    li.id,
    3,
    li.sort_order,
    pn.path || '/' || li.line_item_code
  FROM efs_structure_line_items li
  JOIN efs_structure_subsections sub ON sub.id = li.subsection_id
  JOIN efs_structure_sections sec ON sec.id = sub.section_id
  JOIN efs_structure_nodes pn ON pn.node_code = 'NODE.' || sub.subsection_code
  ON CONFLICT (node_code) DO NOTHING;

  INSERT INTO efs_structure_node_labels (framework_pack_id, structure_node_id, label)
  SELECT p.id, n.id, COALESCE(t.label, li.name)
  FROM efs_framework_packs p
  CROSS JOIN efs_structure_line_items li
  JOIN efs_structure_nodes n ON n.line_item_id = li.id
  LEFT JOIN efs_taxonomy_lines t
    ON t.framework_pack_id = p.id AND t.line_code = li.taxonomy_line_code
  WHERE p.status IN ('published', 'active')
  ON CONFLICT (framework_pack_id, structure_node_id) DO UPDATE SET label = EXCLUDED.label;

  INSERT INTO efs_disclosure_nodes (disclosure_code, name, sort_order) VALUES
    ('DISC.ROOT', 'Disclosures', 1)
  ON CONFLICT (disclosure_code) DO NOTHING;

  INSERT INTO efs_disclosure_nodes (disclosure_code, name, sort_order, parent_id)
  SELECT v.code, v.name, v.sort_order, r.id
  FROM efs_disclosure_nodes r
  CROSS JOIN (VALUES
    ('DISC.ACCOUNTING_POLICIES', 'Accounting policies (placeholder)', 10),
    ('DISC.NOTES_INDEX', 'Notes index (placeholder)', 20),
    ('DISC.OTHER', 'Other disclosures (placeholder)', 30)
  ) AS v(code, name, sort_order)
  WHERE r.disclosure_code = 'DISC.ROOT'
  ON CONFLICT (disclosure_code) DO NOTHING;

  INSERT INTO efs_disclosure_placeholders (disclosure_node_id, placeholder_code, description)
  SELECT d.id, v.code, v.descr
  FROM efs_disclosure_nodes d
  JOIN (VALUES
    ('DISC.ACCOUNTING_POLICIES', 'PH.POLICIES.BODY', 'Reserved for accounting policy narratives'),
    ('DISC.NOTES_INDEX', 'PH.NOTES.INDEX', 'Reserved for note numbering / index'),
    ('DISC.OTHER', 'PH.OTHER.BODY', 'Reserved for other framework disclosures')
  ) AS v(dcode, code, descr) ON d.disclosure_code = v.dcode
  ON CONFLICT (disclosure_node_id, placeholder_code) DO NOTHING;

  INSERT INTO efs_disclosure_references (disclosure_node_id, structure_node_id, reference_role)
  SELECT d.id, n.id, 'related_line'
  FROM efs_disclosure_nodes d
  CROSS JOIN efs_structure_nodes n
  WHERE d.disclosure_code = 'DISC.NOTES_INDEX'
    AND n.node_code IN ('NODE.LI.PERF.RESULT', 'NODE.LI.SFP.PERIOD_RESULT')
  ON CONFLICT DO NOTHING;

  INSERT INTO efs_attachment_points (kind_code, structure_node_id, status)
  SELECT k.kind_code, n.id, 'open'
  FROM efs_structure_nodes n
  CROSS JOIN efs_attachment_point_kinds k
  WHERE n.node_kind = 'line_item'
    AND k.kind_code IN (
      'working_paper', 'lead_schedule', 'supporting_evidence',
      'review_comment', 'validation_result', 'cross_reference', 'note_placeholder'
    )
    AND NOT EXISTS (
      SELECT 1 FROM efs_attachment_points ap
      WHERE ap.structure_node_id = n.id AND ap.kind_code = k.kind_code AND ap.reserved_artefact_ref IS NULL
    );

  INSERT INTO efs_attachment_points (kind_code, disclosure_node_id, status)
  SELECT k.kind_code, d.id, 'open'
  FROM efs_disclosure_nodes d
  CROSS JOIN efs_attachment_point_kinds k
  WHERE d.disclosure_code <> 'DISC.ROOT'
    AND k.kind_code IN ('working_paper', 'supporting_evidence', 'review_comment', 'note_placeholder', 'cross_reference')
    AND NOT EXISTS (
      SELECT 1 FROM efs_attachment_points ap
      WHERE ap.disclosure_node_id = d.id AND ap.kind_code = k.kind_code AND ap.reserved_artefact_ref IS NULL
    );
END $$;

-- ── RLS (platform structure readable; attachment points readable) ────────────
ALTER TABLE efs_structure_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_structure_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_structure_subsections ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_structure_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_structure_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_structure_node_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_disclosure_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_disclosure_placeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_disclosure_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_attachment_point_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_attachment_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_attachment_forbidden_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efs_structure_statements_select ON efs_structure_statements;
CREATE POLICY efs_structure_statements_select ON efs_structure_statements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_structure_sections_select ON efs_structure_sections;
CREATE POLICY efs_structure_sections_select ON efs_structure_sections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_structure_subsections_select ON efs_structure_subsections;
CREATE POLICY efs_structure_subsections_select ON efs_structure_subsections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_structure_line_items_select ON efs_structure_line_items;
CREATE POLICY efs_structure_line_items_select ON efs_structure_line_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_structure_nodes_select ON efs_structure_nodes;
CREATE POLICY efs_structure_nodes_select ON efs_structure_nodes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_structure_node_labels_select ON efs_structure_node_labels;
CREATE POLICY efs_structure_node_labels_select ON efs_structure_node_labels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_disclosure_nodes_select ON efs_disclosure_nodes;
CREATE POLICY efs_disclosure_nodes_select ON efs_disclosure_nodes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_disclosure_placeholders_select ON efs_disclosure_placeholders;
CREATE POLICY efs_disclosure_placeholders_select ON efs_disclosure_placeholders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_disclosure_references_select ON efs_disclosure_references;
CREATE POLICY efs_disclosure_references_select ON efs_disclosure_references FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_attachment_point_kinds_select ON efs_attachment_point_kinds;
CREATE POLICY efs_attachment_point_kinds_select ON efs_attachment_point_kinds FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_attachment_points_select ON efs_attachment_points;
CREATE POLICY efs_attachment_points_select ON efs_attachment_points FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_attachment_forbidden_targets_select ON efs_attachment_forbidden_targets;
CREATE POLICY efs_attachment_forbidden_targets_select ON efs_attachment_forbidden_targets FOR SELECT TO authenticated USING (true);
