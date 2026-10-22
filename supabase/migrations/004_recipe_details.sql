CREATE TABLE recipe_details (
  recipe_id          UUID PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  sections_ast       JSONB NOT NULL DEFAULT '{}',
  ingredients_index  JSONB NOT NULL DEFAULT '[]',
  cookware_index     JSONB NOT NULL DEFAULT '[]',
  raw_fablang        TEXT NOT NULL DEFAULT '',
  important_notes    TEXT NOT NULL DEFAULT ''
);
