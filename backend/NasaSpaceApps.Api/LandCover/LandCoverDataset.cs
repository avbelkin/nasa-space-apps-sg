namespace NasaSpaceApps.Api.LandCover;

public sealed record LandCoverDataset(
    string Id, int Year, int ResolutionMeters, IReadOnlyDictionary<int, string> ClassLabels)
{
    public static LandCoverDataset C3s2019 { get; } = new(
        "c3s-land-cover-v2.1.1", 2019, 300, new Dictionary<int, string>
        {
            [10] = "Rainfed cropland", [11] = "Rainfed herbaceous cropland",
            [12] = "Rainfed tree or shrub cropland", [20] = "Irrigated or post-flooding cropland",
            [30] = "Cropland and natural vegetation mosaic (cropland dominant)",
            [40] = "Natural vegetation and cropland mosaic (vegetation dominant)",
            [50] = "Broadleaved evergreen trees", [60] = "Broadleaved deciduous trees",
            [61] = "Closed broadleaved deciduous trees", [62] = "Open broadleaved deciduous trees",
            [70] = "Needleleaved evergreen trees", [71] = "Closed needleleaved evergreen trees",
            [72] = "Open needleleaved evergreen trees", [80] = "Needleleaved deciduous trees",
            [81] = "Closed needleleaved deciduous trees", [82] = "Open needleleaved deciduous trees",
            [90] = "Mixed broadleaved and needleleaved trees",
            [100] = "Tree, shrub and herbaceous mosaic (trees or shrubs dominant)",
            [110] = "Herbaceous, tree and shrub mosaic (herbaceous dominant)",
            [120] = "Shrubland", [121] = "Evergreen shrubland", [122] = "Deciduous shrubland",
            [130] = "Grassland", [140] = "Lichens and mosses", [150] = "Sparse vegetation",
            [151] = "Sparse trees", [152] = "Sparse shrubs", [153] = "Sparse herbaceous vegetation",
            [160] = "Trees flooded with fresh or brackish water",
            [170] = "Trees flooded with saline water",
            [180] = "Flooded shrub or herbaceous vegetation", [190] = "Urban areas",
            [200] = "Bare areas", [201] = "Consolidated bare areas", [202] = "Unconsolidated bare areas",
            [210] = "Water bodies", [220] = "Permanent snow and ice",
        });
}
