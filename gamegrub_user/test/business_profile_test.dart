import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/models/business.dart';

void main() {
  test(
    'business model exposes complete directions and public profile data',
    () {
      final business = Business.fromJson({
        'business_id': 6,
        'name': 'Pixel Cafe',
        'address_line1': '12 Arena Road',
        'address_line2': 'Unit 4',
        'city': 'Pune',
        'state': 'Maharashtra',
        'postal_code': '411014',
        'phone': '+91 98765 43210',
        'contact_email': 'hello@pixel.example',
        'timezone': 'Asia/Kolkata',
        'opens_at': '09:00:00',
        'closes_at': '23:00:00',
        'latitude': '18.5204300',
        'longitude': '73.8567400',
        'amenities': '["Wi-Fi", "Food counter"]',
        'equipment_highlights': ['240 Hz monitors'],
        'gallery_images': ['/uploads/pixel-cafe.webp'],
        'parking_info': 'Two wheeler parking available.',
        'accessibility_info': 'Step-free entrance.',
        'policies': 'Outside food is not allowed.',
      });

      expect(
        business.fullAddress,
        '12 Arena Road, Unit 4, Pune, Maharashtra, 411014',
      );
      expect(business.scheduleLabel, '9:00 AM - 11:00 PM');
      expect(business.timezone, 'Asia/Kolkata');
      expect(business.contactLabel, '+91 98765 43210 · hello@pixel.example');
      expect(business.hasCoordinates, isTrue);
      expect(business.latitude, 18.52043);
      expect(business.longitude, 73.85674);
      expect(business.amenities, ['Wi-Fi', 'Food counter']);
      expect(business.equipmentHighlights, ['240 Hz monitors']);
      expect(business.galleryImages, ['/uploads/pixel-cafe.webp']);
      expect(business.parkingInfo, 'Two wheeler parking available.');
      expect(business.accessibilityInfo, 'Step-free entrance.');
      expect(business.policies, 'Outside food is not allowed.');
    },
  );
}
