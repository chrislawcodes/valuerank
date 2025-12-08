-- Create test database for isolated testing
-- This script runs when the PostgreSQL container starts

CREATE DATABASE valuerank_test;

-- Grant all privileges to the valuerank user
GRANT ALL PRIVILEGES ON DATABASE valuerank_test TO valuerank;
