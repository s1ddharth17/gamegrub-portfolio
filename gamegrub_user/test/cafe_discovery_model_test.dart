import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/models/cafe_discovery.dart';

void main() {
  test('cafe discovery parses live setups and the planned window', () {
    final result = CafeDiscoveryResult.fromJson({
      'business_id': 12,
      'name': 'Pixel Cafe',
      'city': 'Pune',
      'state': 'Maharashtra',
      'opens_at': '09:00:00',
      'closes_at': '23:00:00',
      'is_open_now': 1,
      'min_price_per_hour': '180.00',
      'station_categories': ['esports_pc', 'high_end_pc'],
      'game_titles': ['Valorant'],
      'available_setups': [
        {
          'pc_id': 41,
          'business_id': 12,
          'specs': 'RTX 4070',
          'category': 'high_end_pc',
          'price_per_hour': 220,
        },
      ],
      'availability_window': {
        'date': '2026-10-26',
        'start_hour': 18,
        'duration_hours': 2,
      },
    });

    expect(result.business.id, 12);
    expect(result.isOpenNow, isTrue);
    expect(result.minPricePerHour, 180);
    expect(result.stationCategories, ['esports_pc', 'high_end_pc']);
    expect(result.gameTitles, ['Valorant']);
    expect(result.availableGroupCount, 1);
    expect(result.availableSetups.single.id, 41);
    expect(result.availableSetups.single.price, 220);
    expect(result.availabilityDate, '2026-10-26');
    expect(result.startHour, 18);
    expect(result.durationHours, 2);
  });
}
