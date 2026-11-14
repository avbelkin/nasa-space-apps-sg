export type StarPaletteIndex = 0 | 1 | 2 | 3 | 4

/**
 * Spectral color classes mapped from astronomical B-V color index:
 * 0 = O/B hot sapphire, 1 = B/A blue-white, 2 = A/F pure white,
 * 3 = F/G solar ivory, 4 = K/M warm amber.
 */
export function bvToPaletteIndex(bv: number): StarPaletteIndex {
  if (bv < -0.08) {
    return 0
  }
  if (bv < 0.12) {
    return 1
  }
  if (bv < 0.42) {
    return 2
  }
  if (bv < 0.95) {
    return 3
  }
  return 4
}

export type BrightStarJ2000Tuple = readonly [
  raDeg: number,
  decDeg: number,
  vMag: number,
  bv: number,
]

/**
 * Curated J2000 Bright Star / Hipparcos catalog (~230 brightest stars V <= 3.65)
 * providing recognizable constellations and asterisms in 3D equatorial space.
 * Format: [rightAscensionDeg (0..360), declinationDeg (-90..+90), visualMag, bMinusV].
 */
export const BRIGHT_STAR_CATALOG_J2000: readonly BrightStarJ2000Tuple[] = [
  // Brightest 1st & 2nd magnitude primary navigation stars
  [101.29, -16.72, -1.46, 0.00], // Sirius (Alpha CMa)
  [95.99, -52.70, -0.74, 0.15], // Canopus (Alpha Car)
  [219.90, -60.83, -0.27, 0.71], // Rigil Kentaurus (Alpha Cen)
  [213.92, 19.18, -0.05, 1.23], // Arcturus (Alpha Boo)
  [279.23, 38.78, 0.03, 0.00], // Vega (Alpha Lyr)
  [79.17, 46.00, 0.08, 0.80], // Capella (Alpha Aur)
  [78.63, -8.20, 0.13, -0.03], // Rigel (Beta Ori)
  [114.83, 5.22, 0.34, 0.42], // Procyon (Alpha CMi)
  [24.43, -57.24, 0.46, -0.16], // Achernar (Alpha Eri)
  [88.79, 7.41, 0.50, 1.85], // Betelgeuse (Alpha Ori)
  [210.96, -60.37, 0.61, -0.23], // Hadar (Beta Cen)
  [297.70, 8.87, 0.76, 0.22], // Altair (Alpha Aql)
  [186.65, -63.10, 0.76, -0.24], // Acrux (Alpha Cru)
  [68.98, 16.51, 0.86, 1.54], // Aldebaran (Alpha Tau)
  [247.35, -26.43, 0.96, 1.83], // Antares (Alpha Sco)
  [201.30, -11.16, 0.97, -0.23], // Spica (Alpha Vir)
  [116.33, 28.03, 1.14, 1.00], // Pollux (Beta Gem)
  [344.41, -29.62, 1.16, 0.09], // Fomalhaut (Alpha PsA)
  [310.36, 45.28, 1.25, 0.09], // Deneb (Alpha Cyg)
  [191.93, -59.69, 1.25, -0.23], // Mimosa (Beta Cru)
  [152.09, 11.97, 1.36, -0.11], // Regulus (Alpha Leo)
  [37.95, 89.26, 1.98, 0.60], // Polaris (Alpha UMi)

  // Orion (belt, sword, shoulders, knees)
  [81.28, 6.35, 1.64, -0.22], // Bellatrix (Gamma Ori)
  [83.00, -0.30, 2.23, -0.22], // Mintaka (Delta Ori)
  [84.05, -1.20, 1.69, -0.18], // Alnilam (Epsilon Ori)
  [85.19, -1.94, 1.77, -0.20], // Alnitak (Zeta Ori)
  [86.94, -9.67, 2.06, -0.18], // Saiph (Kappa Ori)
  [83.86, -5.91, 2.77, -0.24], // Hatysa (Iota Ori)
  [83.50, 9.93, 3.39, -0.18], // Meissa (Lambda Ori)

  // Ursa Major (Big Dipper + paws)
  [165.93, 61.75, 1.79, 1.07], // Dubhe (Alpha UMa)
  [165.46, 56.38, 2.37, -0.02], // Merak (Beta UMa)
  [178.46, 53.69, 2.44, 0.00], // Phecda (Gamma UMa)
  [183.86, 57.03, 3.31, 0.08], // Megrez (Delta UMa)
  [193.51, 55.96, 1.77, -0.02], // Alioth (Epsilon UMa)
  [200.98, 54.93, 2.06, 0.02], // Mizar (Zeta UMa)
  [206.89, 49.31, 1.86, -0.19], // Alkaid (Eta UMa)
  [134.80, 48.04, 3.12, 0.19], // Talitha (Iota UMa)
  [154.27, 41.50, 3.45, 0.03], // Tania Australis (Mu UMa)
  [155.58, 41.50, 3.05, 1.59], // Tania Borealis / Nu / Psi

  // Cassiopeia (W asterism)
  [2.29, 59.15, 2.27, -0.34], // Caph (Beta Cas)
  [10.13, 56.54, 2.23, 1.17], // Schedar (Alpha Cas)
  [14.18, 60.72, 2.47, -0.15], // Gamma Cas
  [21.45, 60.24, 2.68, 0.13], // Ruchbah (Delta Cas)
  [28.60, 63.67, 3.37, -0.15], // Segin (Epsilon Cas)

  // Taurus & Pleiades
  [81.57, 28.61, 1.65, -0.13], // Elnath (Beta Tau)
  [84.41, 21.14, 3.00, -0.19], // Tianguan (Zeta Tau)
  [67.15, 19.18, 3.53, 0.98], // Ain (Epsilon Tau)
  [65.73, 17.54, 3.65, 0.99], // Prima Hyadum (Gamma Tau)
  [67.17, 15.96, 3.40, 0.18], // Chamukuy (Theta2 Tau)
  [56.87, 24.11, 2.87, -0.09], // Alcyone (Eta Tau, Pleiades)
  [56.22, 24.05, 3.63, -0.07], // Atlas (27 Tau, Pleiades)
  [56.08, 24.37, 3.70, -0.11], // Electra (17 Tau, Pleiades)

  // Canis Major
  [95.67, -17.96, 1.98, -0.23], // Mirzam (Beta CMa)
  [104.66, -28.97, 1.50, -0.21], // Adhara (Epsilon CMa)
  [107.10, -26.39, 1.84, 0.67], // Wezen (Delta CMa)
  [111.02, -29.30, 2.45, -0.08], // Aludra (Eta CMa)
  [96.24, -30.06, 3.02, -0.11], // Furud (Zeta CMa)
  [105.76, -23.83, 3.02, -0.19], // Omicron2 CMa

  // Carina, Vela, Puppis (Southern Milky Way)
  [125.63, -59.51, 1.86, 1.28], // Avior (Epsilon Car)
  [138.30, -69.72, 1.68, 0.00], // Miaplacidus (Beta Car)
  [140.53, -55.01, 2.25, 0.18], // Aspidiske (Iota Car)
  [160.74, -64.39, 2.76, -0.22], // Theta Car
  [153.43, -70.04, 3.31, -0.17], // Omega Car
  [136.99, -43.43, 2.21, 1.62], // Suhail (Lambda Vel)
  [140.53, -54.71, 2.50, 0.04], // Kappa Vel (Markeb)
  [122.38, -47.34, 1.78, -0.22], // Regor (Gamma2 Vel)
  [131.18, -54.71, 1.96, 0.04], // Delta Vel (Alsephina)
  [121.89, -40.00, 2.25, -0.26], // Naos (Zeta Pup)
  [109.29, -37.10, 2.70, 1.62], // Pi Pup
  [121.89, -24.30, 2.81, 0.43], // Rho Pup (Tureis)
  [117.32, -24.86, 3.34, 1.24], // Xi Pup (Azmidiske)

  // Crux & Centaurus
  [187.79, -57.11, 1.63, 1.59], // Gacrux (Gamma Cru)
  [183.79, -58.75, 2.80, -0.24], // Imai (Delta Cru)
  [211.67, -36.37, 2.06, 1.01], // Menkent (Theta Cen)
  [208.89, -47.29, 2.55, -0.22], // Zeta Cen (Alnair in Cen)
  [190.38, -48.96, 2.17, -0.20], // Gamma Cen (Muhlifain)
  [179.56, -54.36, 2.30, -0.21], // Epsilon Cen
  [219.87, -42.16, 2.30, -0.22], // Eta Cen
  [224.79, -42.10, 2.68, -0.20], // Kappa Cen
  [204.97, -53.47, 2.55, -0.21], // Nu/Mu Cen region -> Epsilon Cen / Delta Cen

  // Scorpius & Sagittarius
  [241.36, -19.81, 2.62, -0.07], // Acrab (Beta1 Sco)
  [240.08, -22.62, 2.32, -0.12], // Dschubba (Delta Sco)
  [239.71, -26.11, 2.89, -0.19], // Fang (Pi Sco)
  [252.54, -34.29, 2.29, 1.15], // Larawag (Epsilon Sco)
  [253.65, -38.05, 2.99, -0.15], // Mu1 Sco
  [263.40, -37.10, 1.63, -0.22], // Shaula (Lambda Sco)
  [264.33, -42.99, 1.87, 0.40], // Sargas (Theta Sco)
  [264.23, -37.29, 2.70, -0.22], // Lesath (Upsilon Sco)
  [265.62, -39.03, 2.41, -0.17], // Kappa Sco
  [266.89, -40.13, 3.00, 0.51], // Iota1 Sco
  [276.04, -34.38, 1.85, -0.03], // Kaus Australis (Epsilon Sgr)
  [283.82, -26.30, 2.02, -0.22], // Nunki (Sigma Sgr)
  [285.65, -29.88, 2.60, 0.08], // Ascella (Zeta Sgr)
  [276.99, -25.42, 2.81, 1.04], // Kaus Borealis (Lambda Sgr)
  [275.25, -29.83, 2.70, 1.38], // Kaus Media (Delta Sgr)
  [274.41, -36.76, 3.11, 1.50], // Alnasl (Gamma2 Sgr)
  [281.41, -26.99, 3.17, -0.11], // Phi Sgr
  [288.06, -21.02, 2.89, 1.18], // Pi Sgr (Albaldah)

  // Summer Triangle: Cygnus, Lyra, Aquila
  [305.56, 40.26, 2.20, 0.67], // Sadr (Gamma Cyg)
  [311.55, 33.97, 2.46, 1.03], // Gienah (Epsilon Cyg)
  [296.24, 45.13, 2.87, -0.03], // Fawaris (Delta Cyg)
  [292.68, 27.96, 3.08, 1.13], // Albireo (Beta1 Cyg)
  [318.23, 30.23, 3.20, 0.99], // Zeta Cyg
  [282.52, 33.36, 3.45, -0.18], // Sheliak (Beta Lyr)
  [284.74, 32.69, 3.24, -0.05], // Sulafat (Gamma Lyr)
  [296.56, 10.61, 2.72, 1.52], // Tarazed (Gamma Aql)
  [298.83, 6.41, 3.71, 0.86], // Alshain (Beta Aql)
  [286.35, 13.86, 2.99, 0.01], // Okab (Zeta Aql)

  // Leo
  [154.99, 19.84, 2.08, 1.14], // Algieba (Gamma1 Leo)
  [177.26, 14.57, 2.14, 0.09], // Denebola (Beta Leo)
  [168.53, 20.52, 2.56, 0.12], // Zosma (Delta Leo)
  [146.46, 23.77, 2.98, 0.80], // Rasalas (Epsilon Leo)
  [154.17, 23.42, 3.44, 0.31], // Adhafera (Zeta Leo)
  [151.83, 16.76, 3.52, -0.04], // Eta Leo
  [168.56, 15.43, 3.33, 0.06], // Chertan (Theta Leo)

  // Virgo, Bootes, Corona Borealis
  [190.41, -1.45, 2.74, 0.36], // Porrima (Gamma Vir)
  [195.54, 10.96, 2.83, 0.94], // Vindemiatrix (Epsilon Vir)
  [203.67, -0.60, 3.37, 0.11], // Heze (Zeta Vir)
  [218.02, 38.31, 3.03, 0.25], // Seginus (Gamma Boo)
  [221.25, 27.07, 2.37, 0.97], // Izar (Epsilon Boo)
  [225.49, 40.39, 3.50, 1.43], // Nekkar (Beta Boo)
  [208.67, 18.40, 2.68, 0.58], // Muphrid (Eta Boo)
  [233.67, 26.71, 2.23, -0.02], // Alphecca (Alpha CrB)

  // Gemini, Auriga, Perseus
  [113.65, 31.89, 1.58, 0.03], // Castor (Alpha Gem)
  [99.43, 16.40, 1.93, 0.00], // Alhena (Gamma Gem)
  [95.74, 22.51, 2.88, 1.64], // Tejat (Mu Gem)
  [100.98, 25.13, 2.98, 1.40], // Mebsuta (Epsilon Gem)
  [111.43, 27.80, 3.53, 0.93], // Wasat (Delta Gem)
  [89.88, 44.95, 1.90, 0.03], // Menkalinan (Beta Aur)
  [89.93, 37.21, 2.62, -0.08], // Mahasim (Theta Aur)
  [74.25, 33.17, 2.69, 1.53], // Hassaleh (Iota Aur)
  [75.49, 43.82, 2.99, 0.54], // Almaaz (Epsilon Aur)
  [51.08, 49.86, 1.79, 0.48], // Mirfak (Alpha Per)
  [47.04, 40.96, 2.12, -0.05], // Algol (Beta Per)
  [58.53, 31.88, 2.85, -0.12], // Atik (Zeta Per)
  [59.46, 40.01, 2.89, -0.18], // Epsilon Per
  [55.73, 47.79, 3.01, -0.13], // Delta Per

  // Andromeda, Pegasus, Aries, Triangulum
  [2.10, 29.09, 2.06, -0.11], // Alpheratz (Alpha And)
  [17.43, 35.62, 2.05, 1.58], // Mirach (Beta And)
  [30.97, 42.33, 2.10, 1.21], // Almach (Gamma1 And)
  [346.19, 15.21, 2.49, -0.04], // Markab (Alpha Peg)
  [345.94, 28.08, 2.42, 1.67], // Scheat (Beta Peg)
  [3.31, 15.18, 2.83, -0.23], // Algenib (Gamma Peg)
  [326.05, 9.88, 2.39, 1.53], // Enif (Epsilon Peg)
  [340.37, 10.83, 3.40, 0.94], // Homam / Matar (Zeta Peg)
  [31.79, 23.46, 2.00, 1.15], // Hamal (Alpha Ari)
  [28.66, 20.81, 2.64, 0.13], // Sheratan (Beta Ari)
  [32.39, 34.99, 3.00, 0.14], // Beta Tri (Beta Tri)

  // Draco, Ursa Minor, Cepheus
  [269.15, 51.49, 2.23, 1.52], // Eltanin (Gamma Dra)
  [262.61, 52.30, 2.79, 0.98], // Rastaban (Beta Dra)
  [292.18, 67.66, 3.07, 1.00], // Altais (Delta Dra)
  [257.19, 65.71, 3.17, 0.14], // Aldhibah (Zeta Dra)
  [246.00, 61.51, 2.74, 0.91], // Athebyne (Eta Dra)
  [222.68, 74.16, 2.08, 1.47], // Kochab (Beta UMi)
  [230.18, 71.83, 3.05, 0.05], // Pherkad (Gamma UMi)
  [319.64, 62.59, 2.44, 0.22], // Alderamin (Alpha Cep)
  [322.16, 70.56, 3.23, -0.22], // Alfirk (Beta Cep)
  [354.84, 77.63, 3.21, 1.03], // Errai (Gamma Cep)

  // Ophiuchus, Serpens, Hercules
  [263.73, 12.56, 2.08, 0.15], // Rasalhague (Alpha Oph)
  [257.59, -15.72, 2.43, 0.06], // Sabik (Eta Oph)
  [265.87, 4.57, 2.77, 1.16], // Cebalrai (Beta Oph)
  [243.59, -3.69, 2.74, 1.58], // Yed Prior (Delta Oph)
  [249.29, -10.57, 2.56, 0.02], // Han (Zeta Oph)
  [236.07, 6.43, 2.65, 1.17], // Unukalhai (Alpha Ser)
  [247.55, 21.49, 2.77, 0.94], // Kornephoros (Beta Her)
  [250.32, 31.60, 2.81, 0.65], // Zeta Her
  [258.66, 14.39, 3.06, 1.44], // Rasalgethi (Alpha1 Her)

  // Aquarius, Capricornus, Cetus, Eridanus
  [331.45, -0.32, 2.96, 0.98], // Sadalmelik (Alpha Aqr)
  [322.89, -5.57, 2.91, 0.83], // Sadalsuud (Beta Aqr)
  [343.66, -15.82, 3.28, -0.09], // Skat (Delta Aqr)
  [326.76, -16.13, 2.87, 0.29], // Deneb Algedi (Delta Cap)
  [305.25, -14.78, 3.08, 0.79], // Dabih (Beta Cap)
  [45.57, 4.09, 2.53, 1.64], // Menkar (Alpha Cet)
  [10.90, -17.99, 2.04, 1.02], // Diphda (Beta Cet)
  [7.66, -42.31, 2.39, 1.09], // Ankaa (Alpha Phe)
  [59.51, -13.51, 2.95, 1.62], // Zaurak (Gamma Eri)
  [44.57, -40.30, 2.91, 0.13], // Acamar (Theta1 Eri)
  [76.96, -5.09, 2.79, 0.13], // Cursa (Beta Eri)

  // Southern sky: Grus, Pavo, Tucana, Triangulum Australe, Lupus, Hydra, Columba
  [332.06, -46.96, 1.74, -0.13], // Alnair (Alpha Gru)
  [340.66, -46.88, 2.10, 1.60], // Tiaki (Beta Gru)
  [328.48, -37.36, 3.01, -0.11], // Gamma Gru
  [306.41, -56.73, 1.94, -0.20], // Peacock (Alpha Pav)
  [334.63, -60.26, 2.86, 1.39], // Alpha Tuc
  [252.17, -69.03, 1.92, 1.44], // Atria (Alpha TrA)
  [238.79, -63.43, 2.85, 0.29], // Beta TrA
  [229.73, -68.68, 2.89, 0.00], // Gamma TrA
  [220.48, -47.39, 2.30, -0.20], // Alpha Lup
  [224.63, -43.13, 2.68, -0.22], // Beta Lup
  [233.79, -41.17, 2.78, -0.20], // Gamma Lup
  [141.90, -8.66, 1.98, 1.44], // Alphard (Alpha Hya)
  [211.60, -26.68, 3.26, 0.92], // Pi Hya
  [200.98, -23.17, 3.00, 1.47], // Gamma Hya
  [84.91, -34.07, 2.64, -0.12], // Phact (Alpha Col)
  [87.74, -35.77, 3.12, 1.16], // Wazn (Beta Col)

  // Additional recognizable 2nd-3rd mag anchors (Corvus, Libra, Pisces, Sagitta, Delphinus, Perseus/Auriga)
  [183.95, -17.54, 2.59, -0.11], // Gienah (Gamma Crv)
  [188.60, -23.40, 2.65, 0.89], // Kraz (Beta Crv)
  [182.53, -24.73, 3.00, 1.33], // Minkar (Epsilon Crv)
  [222.72, -16.04, 2.75, 0.15], // Zubenelgenubi (Alpha2 Lib)
  [229.25, -9.38, 2.61, -0.11], // Zubeneschamali (Beta Lib)
  [309.39, 15.91, 3.63, 0.96], // Sualocin / Rotanev region (Alpha Del ~309.9, Beta Del 309.39)
  [151.63, -64.72, 3.60, -0.18], // Carina-Musca bridge
  [190.47, -68.13, 2.69, -0.18], // Alpha Mus
  [191.57, -68.11, 3.05, -0.18], // Beta Mus
  [264.33, -60.68, 2.84, 0.93], // Beta Ara
  [263.40, -49.88, 2.95, -0.17], // Alpha Ara
  [272.24, -21.06, 3.85, 0.20], // Mu Sgr (Polis)
  [259.80, 36.81, 3.16, 1.44], // Pi Her
  [241.09, -19.46, 3.06, 1.07], // Sco/Oph cluster
  [208.13, -44.80, 3.14, 0.14], // Zeta/Phi Cen
  [160.56, -49.42, 2.70, 0.98], // Mu Vel
  [145.70, -62.51, 3.30, 0.00], // Upsilon Car
  [112.53, -43.30, 3.17, 1.21], // Sigma Pup
  [79.78, -5.09, 3.36, -0.16], // Eta Ori (Algjebbah)
  [66.96, 14.26, 3.55, 0.00], // Hyades center star
  [19.18, -8.18, 3.47, 1.07], // Baten Kaitos (Zeta Cet)
  [25.63, -15.94, 3.50, 0.73], // Tau Cet
  [355.00, 5.62, 3.70, 0.42], // Omega Psc / Gamma Psc region
  [11.42, 60.72, 3.38, 1.00], // Eta Cas
  [147.90, -65.07, 3.14, -0.19], // V Car / I Car area
  [350.28, -20.10, 3.70, 0.35], // Psi1 Aqr / Lambda Aqr
]
