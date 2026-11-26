-- Runs once, on the first start of an empty Postgres volume:
-- a separate database for the PHPUnit suite (never the app database).
CREATE DATABASE taskflow_test;
