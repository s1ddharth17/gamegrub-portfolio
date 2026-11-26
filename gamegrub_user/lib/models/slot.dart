class Slot {
  final int hour;
  final bool available;
  final String label;

  Slot({required this.hour, required this.available, required this.label});

  factory Slot.fromJson(Map<String, dynamic> json) {
    return Slot(
      hour: int.tryParse('${json['hour'] ?? 0}') ?? 0,
      available: json['available'] == true,
      label: '${json['label'] ?? ''}',
    );
  }
}
