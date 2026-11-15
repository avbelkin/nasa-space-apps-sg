using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class WeatherTimeSeriesTests
{
    private static readonly DateTimeOffset Midnight = new(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);

    [Fact]
    public void SelectionUsesAcquisitionRatherThanLatestFrame()
    {
        var series = new WeatherTimeSeries(Midnight, Hour, [9, 0, 50]);

        var match = Assert.IsType<WeatherTimeMatch>(series.AtOrBefore(Midnight.AddMinutes(75)));

        Assert.Equal(0d, match.Value);
        Assert.Equal(Midnight.AddHours(1), match.ValidThroughUtc);
        Assert.Null(series.AtOrBefore(Midnight.AddMinutes(-1)));
        Assert.Null(series.AtOrBefore(Midnight.AddHours(3)));
    }

    [Fact]
    public void MissingFrameDoesNotFallBackToAnOlderFrame()
    {
        var series = new WeatherTimeSeries(Midnight, Hour, [9, null, 50]);

        Assert.Null(series.AtOrBefore(Midnight.AddMinutes(75)));
        Assert.Null(series.SumTrailing(Midnight.AddHours(2), 3));
    }

    [Fact]
    public void TrailingSumIncludesOnlyCompletedIntervalsAcrossMidnight()
    {
        var series = new WeatherTimeSeries(Midnight.AddHours(-2), Hour, [1, 2, 0, 50]);

        var match = Assert.IsType<WeatherTimeMatch>(series.SumTrailing(Midnight.AddMinutes(55), 3));

        Assert.Equal(3d, match.Value);
        Assert.Equal(Midnight.AddHours(-3), match.ValidFromUtc);
        Assert.Equal(Midnight, match.ValidThroughUtc);
        Assert.Null(series.SumTrailing(Midnight.AddHours(-1), 3));
        Assert.Null(series.SumTrailing(Midnight.AddHours(2), 3));
    }

    [Fact]
    public void SelectionUsesAbsoluteTimeAcrossOffsetsAndRejectsInvalidSamples()
    {
        var series = new WeatherTimeSeries(Midnight.ToOffset(TimeSpan.FromHours(8)), Hour, [7, double.NaN]);

        Assert.Equal(TimeSpan.Zero, series.AtOrBefore(Midnight.AddMinutes(30))?.ValidThroughUtc.Offset);
        Assert.Null(series.AtOrBefore(Midnight.AddHours(1)));
    }
}
