import { previousShift, saveShift } from "../store";
import { writeNotes } from "./ai";
import { diffShifts } from "./changes";
import type { ShiftReport } from "./types";

/** Everything after the checks: overnight diff, Morning Report notes, persistence. */
export async function finishShift(report: ShiftReport, onSaveError?: () => void) {
  const previous = await previousShift(report.finalUrl, report.id).catch(() => null);
  if (previous) report.changes = diffShifts(report, previous);
  report.ai = await writeNotes(report);
  await saveShift(report).catch(() => onSaveError?.());
  return report;
}
