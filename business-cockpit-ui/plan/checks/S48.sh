#!/bin/sh
set -e
npx playwright test --grep "TF-030|TF-031|TF-035|TF-038|TF-043|TF-044"
