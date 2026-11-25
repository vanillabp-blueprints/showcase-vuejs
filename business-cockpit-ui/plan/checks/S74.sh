#!/bin/sh
set -e
# Phase 3 against a running cockpit, see SKILL.md "How you know it is done".
test -f ../business-cockpit-backend/pom.xml
test -f RUN-AGAINST-COCKPIT.md
grep -q "conformance" RUN-AGAINST-COCKPIT.md
