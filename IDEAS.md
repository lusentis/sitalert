# Ideas & Improvements

Backlog of feature ideas and improvements, roughly ordered by effort.

## Medium (1-2 hours)

### "What's here" radius search
Long-press or right-click on the map to show all events within N km. Useful for travelers checking a specific destination before a trip.

### Situation severity trend indicators
Track severity changes over time in situations. Show a small up/down arrow on situation cards when severity is increasing or decreasing.

### Source diversity indicator
Show how many distinct sources confirm a situation. Multi-source events are more reliable — surface that visually on situation cards and in the detail dialog.

### Notification/alert system
Let users set a watched region or category and get browser push notifications for new high-severity events. Store preferences in localStorage.

## Big (half day+)

### "My trip" mode
Enter a country/city + date range, get a filtered view of only relevant events + advisory summary. The core use case for travelers doing pre-trip safety checks.

### Historical timeline
Wire the existing `TimelineBar` component back in (built but not rendered). Let users scrub through time to see how situations evolved. Requires backend support for arbitrary time ranges.

### Email digest
Daily/weekly email summary of high-severity events for subscribed regions. Needs a subscription system, email provider integration (e.g. Resend), and a cron job.
