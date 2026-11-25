#!/bin/sh
set -e
npx playwright test --grep "TF-007|TF-017|TF-018|TF-024|TF-045"
