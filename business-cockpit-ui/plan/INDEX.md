# Plan

Job: generate the Business Cockpit of acme (placeholder organisation), UI in Vue 3.5 with Vuetify 4.3
Reference: 1.0.0
Started: 2026-11-25

| Id  | Title | Status | Checklist ids | Check command |
|-----|-------|--------|---------------|---------------|
| S01 | The UI repository builds and tests itself (1 of 3) | done | PKG-044, PKG-035, PKG-045, PKG-019, PKG-002, PKG-062 | `sh plan/checks/S01.sh` |
| S02 | The UI repository builds and tests itself (2 of 3) | done | PKG-055, PKG-047, PKG-046, PKG-014, PKG-008, PKG-052 | `sh plan/checks/S02.sh` |
| S03 | The UI repository builds and tests itself (3 of 3) | done | PKG-063, PKG-064, PKG-054 | `sh plan/checks/S03.sh` |
| S04 | The backend starts and serves the user interface (1 of 3) | done | BE-001, BE-024, BE-025, BE-002, BE-003, BE-014 | `sh plan/checks/S04.sh` |
| S05 | The backend starts and serves the user interface (2 of 3) | done | BE-028, BE-012, BE-006, PKG-003, PKG-004, PKG-005 | `sh plan/checks/S05.sh` |
| S06 | The backend starts and serves the user interface (3 of 3) | done | PKG-059, BE-031 | `sh plan/checks/S06.sh` |
| S07 | A user logs in and out (1 of 4) | done | BE-005, BE-010, BE-011, BE-007, BE-008, BE-013 | `sh plan/checks/S07.sh` |
| S08 | A user logs in and out (2 of 4) | done | BE-017, BE-027, AUTH-002, AUTH-003, AUTH-004, AUTH-005 | `sh plan/checks/S08.sh` |
| S09 | A user logs in and out (3 of 4) | done | AUTH-006, AUTH-008, AUTH-009, AUTH-010, AUTH-007, BE-032 | `sh plan/checks/S09.sh` |
| S10 | A user logs in and out (4 of 4) | done | BE-033, BE-034 | `sh plan/checks/S10.sh` |
| S11 | The user sees the header and the menu (1 of 3) | done | NAV-006, NAV-009, NAV-010, NAV-011, NAV-013, NAV-029 | `sh plan/checks/S11.sh` |
| S12 | The user sees the header and the menu (2 of 3) | done | NAV-031, NAV-032, I18N-001, I18N-002, I18N-004, I18N-005 | `sh plan/checks/S12.sh` |
| S13 | The user sees the header and the menu (3 of 3) | done | I18N-006 | `sh plan/checks/S13.sh` |
| S14 | The settings of a user are kept on the server | done | SET-001, SET-002, SET-004, SET-005, SET-006 | `sh plan/checks/S14.sh` |
| S15 | A clerk sees the tasks waiting for them (1 of 3) | done | BE-004, NAV-001, NAV-002, TL-008, TL-012, TL-013 | `sh plan/checks/S15.sh` |
| S16 | A clerk sees the tasks waiting for them (2 of 3) | done | TL-015, TL-016, TL-018, TL-024, TL-032, COL-015 | `sh plan/checks/S16.sh` |
| S17 | A clerk sees the tasks waiting for them (3 of 3) | done | COL-017, COL-018, COL-019, COL-021, BE-020, TL-033 | `sh plan/checks/S17.sh` |
| S18 | A clerk switches between open and closed tasks and sees the counts (1 of 2) | done | TL-001, TL-002, TL-003, TL-005, TL-006, TL-009 | `sh plan/checks/S18.sh` |
| S19 | A clerk switches between open and closed tasks and sees the counts (2 of 2) | done | TL-010, TL-021, TL-028 | `sh plan/checks/S19.sh` |
| S20 | A clerk sees which tasks are unread, ended or suspended | done | TL-007, TL-023 | `sh plan/checks/S20.sh` |
| S21 | A clerk claims, proposes, marks and puts aside a task in the list (1 of 3) | done | TL-014, TL-017, TL-025, ACT-001, ACT-003, ACT-004 | `sh plan/checks/S21.sh` |
| S22 | A clerk claims, proposes, marks and puts aside a task in the list (2 of 3) | done | ACT-005, ACT-006, ACT-007, ACT-008, ACT-009, ACT-010 | `sh plan/checks/S22.sh` |
| S23 | A clerk claims, proposes, marks and puts aside a task in the list (3 of 3) | done | ACT-012, ACT-013, ACT-015, ACT-016, ACT-017 | `sh plan/checks/S23.sh` |
| S24 | A clerk searches, filters and sorts a list (1 of 2) | done | SRCH-001, SRCH-002, SRCH-003, SRCH-004, SRCH-005, SRCH-006 | `sh plan/checks/S24.sh` |
| S25 | A clerk searches, filters and sorts a list (2 of 2) | done | SRCH-007, SRCH-008, SRCH-009, SRCH-026, SRCH-027, SRCH-033 | `sh plan/checks/S25.sh` |
| S25b | A clerk searches, filters and sorts a list (2b) | done | SRCH-034 | `sh plan/checks/S25b.sh` |
| S26 | A clerk scrolls through very many tasks (1 of 4) | done | I18N-007, SRCH-010, SRCH-011, SRCH-012, SRCH-013, SRCH-014 | `sh plan/checks/S26.sh` |
| S27 | A clerk scrolls through very many tasks (2 of 4) | done | SRCH-015, SRCH-016, SRCH-017, SRCH-018, SRCH-019, SRCH-020 | `sh plan/checks/S27.sh` |
| S28 | A clerk scrolls through very many tasks (3 of 4) | done | SRCH-021, SRCH-022, SRCH-023, SRCH-024, SRCH-025, SRCH-028 | `sh plan/checks/S28.sh` |
| S29 | A clerk scrolls through very many tasks (4 of 4) | done | SRCH-029, SRCH-030, SRCH-031, SRCH-032 | `sh plan/checks/S29.sh` |
| S30 | A clerk acts on several selected tasks at once | done | TL-011, TL-019, TL-029, TL-030, TL-031, ACT-018 | `sh plan/checks/S30.sh` |
| S31 | A workflow module builds its parts against the module kit (1 of 3) | done | PKG-006, PKG-009, PKG-017, PKG-020, PKG-033, PKG-039 | `sh plan/checks/S31.sh` |
| S32 | A workflow module builds its parts against the module kit (2 of 3) | done | PKG-040, PKG-041, PKG-042, PKG-043, PKG-048, PKG-049 | `sh plan/checks/S32.sh` |
| S33 | A workflow module builds its parts against the module kit (3 of 3) | done | PKG-050, PKG-051, PKG-053, PKG-056, PKG-057 | `sh plan/checks/S33.sh` |
| S34 | The cockpit loads the parts of the modules (1 of 6) | done | EXT-005, EXT-007, EXT-008, EXT-009, EXT-010, EXT-011 | `sh plan/checks/S34.sh` |
| S35 | The cockpit loads the parts of the modules (2 of 6) | done | EXT-016, EXT-019, EXT-021, EXT-026, EXT-027, EXT-029 | `sh plan/checks/S35.sh` |
| S36 | The cockpit loads the parts of the modules (3 of 6) | done | EXT-031, EXT-033, EXT-034, EXT-035, EXT-036, EXT-037 | `sh plan/checks/S36.sh` |
| S37 | The cockpit loads the parts of the modules (4 of 6) | done | EXT-041, EXT-043, EXT-044, EXT-045, EXT-046, EXT-047 | `sh plan/checks/S37.sh` |
| S38 | The cockpit loads the parts of the modules (5 of 6) | done | EXT-048, EXT-049, EXT-050, EXT-051, EXT-052, EXT-053 | `sh plan/checks/S38.sh` |
| S39 | The cockpit loads the parts of the modules (6 of 6) | done | EXT-054, EXT-055, EXT-056, EXT-057, EXT-059 | `sh plan/checks/S39.sh` |
| S40 | The lists show the columns of the modules (1 of 3) | done | COL-001, COL-003, COL-004, COL-005, COL-006, COL-007 | `sh plan/checks/S40.sh` |
| S41 | The lists show the columns of the modules (2 of 3) | done | COL-008, COL-009, COL-010, COL-011, COL-012, COL-013 | `sh plan/checks/S41.sh` |
| S42 | The lists show the columns of the modules (3 of 3) | done | COL-016, COL-020, COL-022 | `sh plan/checks/S42.sh` |
| S43 | A clerk opens a task and works on it in the form of the module (1 of 4) | done | TL-022, ACT-019, TF-001, TF-004, TF-005, TF-006 | `sh plan/checks/S43.sh` |
| S44 | A clerk opens a task and works on it in the form of the module (2 of 4) | done | TF-008, TF-016, TF-019, TF-020, TF-022, TF-023 | `sh plan/checks/S44.sh` |
| S45 | A clerk opens a task and works on it in the form of the module (3 of 4) | done | TF-025, TF-026, TF-027, TF-029, TF-039, TF-040 | `sh plan/checks/S45.sh` |
| S46 | A clerk opens a task and works on it in the form of the module (4 of 4) | done | TF-041, TF-042 | `sh plan/checks/S46.sh` |
| S47 | A clerk works on a task in a tab of its own and goes back to the list | done | TF-007, TF-017, TF-018, TF-024, TF-045 | `sh plan/checks/S47.sh` |
| S48 | A clerk claims a task before working on it, and a suspended task waits | done | TF-030, TF-031, TF-035, TF-038, TF-043, TF-044 | `sh plan/checks/S48.sh` |
| S49 | A clerk looks up a case in the case list (1 of 3) | done | NAV-003, WL-001, WL-002, WL-003, WL-004, WL-005 | `sh plan/checks/S49.sh` |
| S50 | A clerk looks up a case in the case list (2 of 3) | done | WL-006, WL-007, WL-008, WL-009, WL-010, WL-012 | `sh plan/checks/S50.sh` |
| S51 | A clerk looks up a case in the case list (3 of 3) | done | WL-013 | `sh plan/checks/S51.sh` |
| S52 | A clerk opens the page of a case (1 of 2) | done | NAV-004, TF-013, WP-001, WP-003, WP-007, WP-008 | `sh plan/checks/S52.sh` |
| S53 | A clerk opens the page of a case (2 of 2) | done | WP-009, WP-010, WP-011, WP-012, WP-014, WP-015 | `sh plan/checks/S53.sh` |
| S54 | A clerk sees changes without a reload (1 of 5) | done | TF-011, TF-037, LIVE-001, LIVE-002, LIVE-003, LIVE-004 | `sh plan/checks/S54.sh` |
| S55 | A clerk sees changes without a reload (2 of 5) | done | LIVE-005, LIVE-006, LIVE-007, LIVE-010, LIVE-011, LIVE-012 | `sh plan/checks/S55.sh` |
| S56 | A clerk sees changes without a reload (3 of 5) | done | LIVE-013, LIVE-014, LIVE-015, LIVE-016, LIVE-017, LIVE-018 | `sh plan/checks/S56.sh` |
| S57 | A clerk sees changes without a reload (4 of 5) | done | LIVE-019, LIVE-020, LIVE-021, LIVE-022, LIVE-023, LIVE-024 | `sh plan/checks/S57.sh` |
| S58 | A clerk sees changes without a reload (5 of 5) | done | LIVE-025 | `sh plan/checks/S58.sh` |
| S59 | A module adds pages, dialogs, buttons and charts of its own (1 of 2) | done | EXT-012, EXT-013, EXT-014, EXT-018, EXT-023, EXT-060 | `sh plan/checks/S59.sh` |
| S60 | A module adds pages, dialogs, buttons and charts of its own (2 of 2) | done | EXT-024, EXT-039, EXT-040, EXT-042 | `sh plan/checks/S60.sh` |
| S61 | A clerk works in their language, in every browser (1 of 2) | done | NAV-014, NAV-015, NAV-016, NAV-028, SET-003, I18N-003 | `sh plan/checks/S61.sh` |
| S62 | A clerk works in their language, in every browser (2 of 2) | open | I18N-008 | `sh plan/checks/S62.sh` |
| S63 | A clerk sees their rights and the pictures of persons | open | NAV-019, NAV-020, NAV-021, NAV-022, NAV-027, NAV-030 | `sh plan/checks/S63.sh` |
| S64 | A clerk sets up notifications and gets mails | open | BE-016, TF-014, NOTI-001, NOTI-002, NOTI-003 | `sh plan/checks/S64.sh` |
| S65 | A module developer works on a form in the dev shell (1 of 5) | open | PKG-034, DS-001, DS-002, DS-003, DS-004, DS-005 | `sh plan/checks/S65.sh` |
| S66 | A module developer works on a form in the dev shell (2 of 5) | open | DS-006, DS-007, DS-008, DS-009, DS-010, DS-011 | `sh plan/checks/S66.sh` |
| S67 | A module developer works on a form in the dev shell (3 of 5) | open | DS-012, DS-013, DS-014, DS-015, DS-016, DS-017 | `sh plan/checks/S67.sh` |
| S68 | A module developer works on a form in the dev shell (4 of 5) | open | DS-018, DS-019, DS-020, DS-021, DS-022, DS-023 | `sh plan/checks/S68.sh` |
| S69 | A module developer works on a form in the dev shell (5 of 5) | open | DS-024, DS-025, DS-026 | `sh plan/checks/S69.sh` |
| S70 | The cockpit is released and deployed (1 of 2) | open | PKG-011, PKG-024, PKG-025, PKG-032, PKG-036, PKG-037 | `sh plan/checks/S70.sh` |
| S71 | The cockpit is released and deployed (2 of 2) | open | PKG-061, BE-018, BE-019, EXT-058 | `sh plan/checks/S71.sh` |
| S72 | The wishes of the customer | open | CUST-001, CUST-002 | `sh plan/checks/S72.sh` |
| S73 | Every checklist item has a passing test | open |  | `sh plan/checks/S73.sh` |
| S74 | Run against a running cockpit | open |  | `sh plan/checks/S74.sh` |
