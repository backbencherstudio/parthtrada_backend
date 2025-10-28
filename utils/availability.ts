function groupDays(days: string[]) {
    const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const sorted = days.sort((a, b) => week.indexOf(a) - week.indexOf(b));

    const groups = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const prevIndex = week.indexOf(prev);
        const currentIndex = week.indexOf(current);

        if (currentIndex - prevIndex !== 1) {
            groups.push(start === prev ? start : `${start}-${prev}`);
            start = current;
        }
        prev = current;
    }

    groups.push(start === prev ? start : `${start}-${prev}`);
    return groups;
}

function to24Hour(timeStr: string) {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function getTimeRange(times: string[]) {
    if (!times.length) return [];
    const start = to24Hour(times[0]);
    const end = to24Hour(times[times.length - 1]);
    return [`${start} - ${end}`];
}

function normalizeTimeArray(result: { availableDays: string[], availableTime: string[] }) {
    const { availableDays, availableTime } = result;
    const times =
        availableTime.length === 1
            ? Array(availableDays.length).fill(availableTime[0])
            : availableTime;

    return {
        availableDays,
        availableTime: times
    };
}

export {
    groupDays,
    getTimeRange,
    normalizeTimeArray
}
