export type TicketStatus = "open" | "in_progress" | "pending_user" | "resolved" | "closed" | "rejected";

export type TicketStatusSnapshot = {
  status: string;
  createdDate?: string;
  updatedDate?: string;
  responseDate?: string;
};

export function normalizeTicketStatus(status?: string): TicketStatus {
  switch ((status || "open").toLowerCase()) {
    case "in_progress":
    case "in-progress":
    case "assigned":
      return "in_progress";
    case "pending_user":
    case "pending-user":
    case "awaiting_rider":
      return "pending_user";
    case "resolved":
      return "resolved";
    case "closed":
      return "closed";
    case "rejected":
      return "rejected";
    default:
      return "open";
  }
}

export function ticketStatusLabel(status?: string): string {
  switch (normalizeTicketStatus(status)) {
    case "in_progress": return "In progress";
    case "pending_user": return "Waiting for you";
    case "resolved": return "Resolved";
    case "closed": return "Closed";
    case "rejected": return "Closed without action";
    default: return "Open";
  }
}

export function ticketProgress(status?: string): Array<{ key: TicketStatus; label: string; complete: boolean; current: boolean }> {
  const current = normalizeTicketStatus(status);
  const steps: TicketStatus[] = ["open", "in_progress", "resolved"];
  const progressStatus = current === "pending_user" ? "in_progress" : current;
  const currentIndex = steps.indexOf(progressStatus === "closed" || progressStatus === "rejected" ? "resolved" : progressStatus);
  return steps.map((key, index) => ({
    key,
    label: key === "open" ? "Received" : key === "in_progress" ? "Under review" : "Resolved",
    complete: index < currentIndex || current === "resolved" || current === "closed",
    current: key === current || (current === "pending_user" && key === "in_progress"),
  }));
}

export function formatTicketTimestamp(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" });
}
