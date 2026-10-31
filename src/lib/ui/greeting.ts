/** Greeting for the visitor's local hour (0-23, from their own browser clock). Late night counts as evening. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "good morning.";
  if (hour >= 12 && hour < 17) return "good afternoon.";
  return "good evening.";
}
