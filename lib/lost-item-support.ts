export type LostItemContactMethod = "whatsapp" | "phone" | "email";

export type LostItemForm = {
  rideId: string;
  itemDescription: string;
  contactMethod: LostItemContactMethod;
  contactValue: string;
};

export function validateLostItemForm(form: Pick<LostItemForm, "itemDescription">): string | null {
  const description = form.itemDescription.trim();
  if (!description) return "Please describe the item you lost.";
  if (description.length < 3) return "Please provide a little more detail about the item.";
  return null;
}

export function buildLostItemDescription(form: LostItemForm): string {
  const contact = form.contactValue.trim() || "Use the rider's account contact details";
  return [
    "Lost item report",
    `Item description: ${form.itemDescription.trim()}`,
    `Preferred contact: ${form.contactMethod}`,
    `Contact details: ${contact}`,
    `Ride ID: ${form.rideId}`,
  ].join("\n");
}

export function buildLostItemSupportMessage(form: LostItemForm, destination: string): string {
  return [
    "Hi HY3N Support, I need help recovering an item lost in my ride.",
    `Ride ID: ${form.rideId}`,
    `Destination: ${destination}`,
    `Item: ${form.itemDescription.trim()}`,
    `Preferred contact: ${form.contactMethod}${form.contactValue.trim() ? ` (${form.contactValue.trim()})` : ""}`,
  ].join("\n");
}
