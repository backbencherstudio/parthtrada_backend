export default function calculateSlotAmount(hourlyRate: number, minutes: number): number {
    return (hourlyRate * minutes) / 60;
}
