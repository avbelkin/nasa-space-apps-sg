namespace NasaSpaceApps.Api.Clouds;

/// <summary>
/// Per-instance stable identity for upstream layers.extremum.org requests,
/// supplying a single gis-uuid cookie value generated once for the backend lifetime.
/// </summary>
public sealed class ExtremumCloudInstanceIdentity
{
    public string GisUuid { get; } = Guid.NewGuid().ToString("D");
}
