class AppConstants {
  static const int openHour = 9;
  static const int closeHour = 23;

  static const List<String> openStatuses = <String>[
    'confirmed',
    'running',
    'session_over',
    'active',
  ];

  static const List<String> closedStatuses = <String>[
    'closed',
    'cancelled',
    'completed',
  ];
}
