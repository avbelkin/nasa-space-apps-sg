namespace NasaSpaceApps.Api.Weather;

internal readonly record struct WeatherTimeMatch(
    double Value,
    DateTimeOffset ValidFromUtc,
    DateTimeOffset ValidThroughUtc);

// Point values are valid at their timestamp. For interval quantities, timestamps
// mark the end of each interval, so trailing sums include only completed periods.
internal sealed class WeatherTimeSeries
{
    private readonly DateTimeOffset firstTimeUtc;
    private readonly TimeSpan cadence;
    private readonly IReadOnlyList<double?> values;

    public WeatherTimeSeries(DateTimeOffset firstTime, TimeSpan cadence, IReadOnlyList<double?> values)
    {
        if (cadence <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(cadence));
        }

        firstTimeUtc = firstTime.ToUniversalTime();
        this.cadence = cadence;
        this.values = values;
    }

    public WeatherTimeMatch? AtOrBefore(DateTimeOffset acquiredAt)
    {
        var index = IndexAtOrBefore(acquiredAt);
        if (index < 0 || values[index] is not double value || !double.IsFinite(value))
        {
            return null;
        }

        var time = TimeAt(index);
        return new WeatherTimeMatch(value, time, time);
    }

    public WeatherTimeMatch? SumTrailing(DateTimeOffset acquiredAt, int intervals)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(intervals);
        var end = IndexAtOrBefore(acquiredAt);
        if (end < intervals - 1)
        {
            return null;
        }

        var first = end - (intervals - 1);
        var sum = 0d;
        for (var index = first; index <= end; index++)
        {
            if (values[index] is not double value || !double.IsFinite(value))
            {
                return null;
            }

            sum += value;
        }

        return double.IsFinite(sum) ? new WeatherTimeMatch(sum, TimeAt(first).Subtract(cadence), TimeAt(end)) : null;
    }

    private int IndexAtOrBefore(DateTimeOffset acquiredAt)
    {
        var elapsed = acquiredAt - firstTimeUtc;
        if (elapsed < TimeSpan.Zero)
        {
            return -1;
        }

        var index = elapsed.Ticks / cadence.Ticks;
        return index < values.Count ? (int)index : -1;
    }

    private DateTimeOffset TimeAt(int index) => firstTimeUtc.AddTicks(cadence.Ticks * index);
}
