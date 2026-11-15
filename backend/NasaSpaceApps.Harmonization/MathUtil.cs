namespace NasaSpaceApps.Harmonization;

internal static class MathUtil
{
    public static double Log1p(double x) =>
        Math.Abs(x) < 1e-12 ? x - 0.5 * x * x : Math.Log(1.0 + x);

    public static double Expm1(double x) =>
        Math.Abs(x) < 1e-12 ? x + 0.5 * x * x : Math.Exp(x) - 1.0;

    public static double Softplus(double z) =>
        z > 0 ? z + Log1p(Math.Exp(-z)) : Log1p(Math.Exp(z));
}
