FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["NasaSpaceApps.Api/NasaSpaceApps.Api.csproj", "NasaSpaceApps.Api/"]
RUN dotnet restore "NasaSpaceApps.Api/NasaSpaceApps.Api.csproj"

COPY . .
RUN dotnet publish "NasaSpaceApps.Api/NasaSpaceApps.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_HTTP_PORTS=8080
USER $APP_UID
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "NasaSpaceApps.Api.dll"]
