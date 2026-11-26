const String stationCategoryAll = 'all';
const String stationCategoryHighEndPc = 'high_end_pc';
const String stationCategoryEsportsPc = 'esports_pc';
const String stationCategoryConsole = 'console';

const List<String> stationCategoryFilters = <String>[
  stationCategoryAll,
  stationCategoryHighEndPc,
  stationCategoryEsportsPc,
  stationCategoryConsole,
];

String normalizeStationCategory(String? value) {
  switch ((value ?? '').trim().toLowerCase()) {
    case stationCategoryHighEndPc:
      return stationCategoryHighEndPc;
    case stationCategoryConsole:
      return stationCategoryConsole;
    case stationCategoryEsportsPc:
    default:
      return stationCategoryEsportsPc;
  }
}

String stationCategoryDisplayLabel(String? value) {
  switch (normalizeStationCategory(value)) {
    case stationCategoryHighEndPc:
      return 'High-End PC';
    case stationCategoryConsole:
      return 'Console';
    case stationCategoryEsportsPc:
    default:
      return 'Esports PC';
  }
}

String stationDeviceLabel(String? value) {
  return normalizeStationCategory(value) == stationCategoryConsole
      ? 'Console'
      : 'PC';
}

bool stationMatchesCategory(String? stationCategory, String selectedCategory) {
  if (selectedCategory == stationCategoryAll) {
    return true;
  }

  return normalizeStationCategory(stationCategory) ==
      normalizeStationCategory(selectedCategory);
}
