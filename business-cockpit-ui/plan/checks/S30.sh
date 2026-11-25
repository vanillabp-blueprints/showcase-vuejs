#!/bin/sh
set -e
npx playwright test --grep "TL-011|TL-019|TL-029|TL-030|TL-031|ACT-018"
