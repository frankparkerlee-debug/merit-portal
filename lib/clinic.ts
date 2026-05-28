// Static clinic/staff facts surfaced in the portal UI and in patient-facing
// emails. Single source of truth so updating the prescribing physician's
// name is a one-line change here, not a sweep across templates.

export const PRESCRIBING_PHYSICIAN = {
  name: "Tobore Kokoricha, MD",
  shortName: "Dr. Kokoricha",
} as const;
