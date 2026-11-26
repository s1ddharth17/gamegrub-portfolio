import 'dart:convert';

class Business {
  final int id;
  final String slug;
  final String name;
  final String tagline;
  final String description;
  final String city;
  final String state;
  final String addressLine1;
  final String addressLine2;
  final String postalCode;
  final String phone;
  final String contactEmail;
  final String timezone;
  final String opensAt;
  final String closesAt;
  final double? latitude;
  final double? longitude;
  final List<String> amenities;
  final List<String> equipmentHighlights;
  final List<String> galleryImages;
  final String parkingInfo;
  final String accessibilityInfo;
  final String policies;
  final String logoImage;
  final String coverImage;
  final bool isFeatured;
  final double commissionRate;
  final double convenienceFeeFlat;
  final double convenienceFeeRate;
  final double averageRating;
  final int reviewCount;
  final int totalRigs;
  final int activeRigs;
  final int availableRigs;
  final int menuItemCount;
  final int featuredMenuItemCount;
  final int publishedTournamentCount;

  const Business({
    required this.id,
    required this.slug,
    required this.name,
    required this.tagline,
    required this.description,
    required this.city,
    required this.state,
    required this.addressLine1,
    this.addressLine2 = '',
    this.postalCode = '',
    required this.phone,
    required this.contactEmail,
    this.timezone = 'Asia/Kolkata',
    required this.opensAt,
    required this.closesAt,
    this.latitude,
    this.longitude,
    this.amenities = const [],
    this.equipmentHighlights = const [],
    this.galleryImages = const [],
    this.parkingInfo = '',
    this.accessibilityInfo = '',
    this.policies = '',
    required this.logoImage,
    required this.coverImage,
    required this.isFeatured,
    required this.commissionRate,
    required this.convenienceFeeFlat,
    required this.convenienceFeeRate,
    required this.averageRating,
    required this.reviewCount,
    required this.totalRigs,
    required this.activeRigs,
    required this.availableRigs,
    required this.menuItemCount,
    required this.featuredMenuItemCount,
    required this.publishedTournamentCount,
  });

  factory Business.fromJson(Map<String, dynamic> json) {
    return Business(
      id: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      slug: '${json['slug'] ?? ''}',
      name: '${json['name'] ?? 'Cafe'}',
      tagline: '${json['tagline'] ?? ''}',
      description: '${json['description'] ?? ''}',
      city: '${json['city'] ?? ''}',
      state: '${json['state'] ?? ''}',
      addressLine1: '${json['address_line1'] ?? ''}',
      addressLine2: '${json['address_line2'] ?? ''}',
      postalCode: '${json['postal_code'] ?? ''}',
      phone: '${json['phone'] ?? ''}',
      contactEmail: '${json['contact_email'] ?? ''}',
      timezone: '${json['timezone'] ?? 'Asia/Kolkata'}',
      opensAt: '${json['opens_at'] ?? ''}',
      closesAt: '${json['closes_at'] ?? ''}',
      latitude: double.tryParse('${json['latitude'] ?? ''}'),
      longitude: double.tryParse('${json['longitude'] ?? ''}'),
      amenities: _readList(json['amenities']),
      equipmentHighlights: _readList(json['equipment_highlights']),
      galleryImages: _readList(json['gallery_images']),
      parkingInfo: '${json['parking_info'] ?? ''}',
      accessibilityInfo: '${json['accessibility_info'] ?? ''}',
      policies: '${json['policies'] ?? ''}',
      logoImage: '${json['logo_image'] ?? ''}',
      coverImage: '${json['cover_image'] ?? ''}',
      isFeatured:
          json['is_featured'] == true || '${json['is_featured']}' == '1',
      commissionRate: double.tryParse('${json['commission_rate'] ?? 0}') ?? 0,
      convenienceFeeFlat:
          double.tryParse('${json['convenience_fee_flat'] ?? 0}') ?? 0,
      convenienceFeeRate:
          double.tryParse('${json['convenience_fee_rate'] ?? 0}') ?? 0,
      averageRating: double.tryParse('${json['average_rating'] ?? 0}') ?? 0,
      reviewCount: int.tryParse('${json['review_count'] ?? 0}') ?? 0,
      totalRigs: int.tryParse('${json['total_rigs'] ?? 0}') ?? 0,
      activeRigs: int.tryParse('${json['active_rigs'] ?? 0}') ?? 0,
      availableRigs: int.tryParse('${json['available_rigs'] ?? 0}') ?? 0,
      menuItemCount: int.tryParse('${json['menu_item_count'] ?? 0}') ?? 0,
      featuredMenuItemCount:
          int.tryParse('${json['featured_menu_item_count'] ?? 0}') ?? 0,
      publishedTournamentCount:
          int.tryParse('${json['published_tournament_count'] ?? 0}') ?? 0,
    );
  }

  Business copyWith({double? averageRating, int? reviewCount}) {
    return Business(
      id: id,
      slug: slug,
      name: name,
      tagline: tagline,
      description: description,
      city: city,
      state: state,
      addressLine1: addressLine1,
      addressLine2: addressLine2,
      postalCode: postalCode,
      phone: phone,
      contactEmail: contactEmail,
      timezone: timezone,
      opensAt: opensAt,
      closesAt: closesAt,
      latitude: latitude,
      longitude: longitude,
      amenities: amenities,
      equipmentHighlights: equipmentHighlights,
      galleryImages: galleryImages,
      parkingInfo: parkingInfo,
      accessibilityInfo: accessibilityInfo,
      policies: policies,
      logoImage: logoImage,
      coverImage: coverImage,
      isFeatured: isFeatured,
      commissionRate: commissionRate,
      convenienceFeeFlat: convenienceFeeFlat,
      convenienceFeeRate: convenienceFeeRate,
      averageRating: averageRating ?? this.averageRating,
      reviewCount: reviewCount ?? this.reviewCount,
      totalRigs: totalRigs,
      activeRigs: activeRigs,
      availableRigs: availableRigs,
      menuItemCount: menuItemCount,
      featuredMenuItemCount: featuredMenuItemCount,
      publishedTournamentCount: publishedTournamentCount,
    );
  }

  String get shortLocation {
    final parts = <String>[
      city.trim(),
      state.trim(),
    ].where((value) => value.isNotEmpty).toList();
    return parts.isEmpty ? 'Location coming soon' : parts.join(', ');
  }

  String get fullAddress {
    final parts = <String>[
      addressLine1.trim(),
      addressLine2.trim(),
      city.trim(),
      state.trim(),
      postalCode.trim(),
    ].where((value) => value.isNotEmpty).toList();
    return parts.isEmpty ? 'Address coming soon' : parts.join(', ');
  }

  String get scheduleLabel {
    final openLabel = _formatTime(opensAt);
    final closeLabel = _formatTime(closesAt);

    if (openLabel == null || closeLabel == null) {
      return 'Hours updating soon';
    }

    return '$openLabel - $closeLabel';
  }

  String get supportLabel {
    if (contactEmail.trim().isNotEmpty) {
      return contactEmail.trim();
    }

    if (phone.trim().isNotEmpty) {
      return phone.trim();
    }

    return 'Message this cafe in GameGrub';
  }

  String get contactLabel {
    final contacts = <String>[
      if (phone.trim().isNotEmpty) phone.trim(),
      if (contactEmail.trim().isNotEmpty) contactEmail.trim(),
    ];
    return contacts.isEmpty ? 'Contact details updating' : contacts.join(' · ');
  }

  bool get hasReviews => reviewCount > 0 && averageRating > 0;

  bool get hasCoordinates => latitude != null && longitude != null;

  String get averageRatingLabel =>
      averageRating.toStringAsFixed(hasReviews ? 1 : 0);

  String get reviewSummaryLabel {
    if (!hasReviews) {
      return 'No reviews yet';
    }

    final reviewWord = reviewCount == 1 ? 'review' : 'reviews';
    return '${averageRating.toStringAsFixed(1)} from $reviewCount $reviewWord';
  }

  String get summaryDescription {
    if (description.trim().isNotEmpty) {
      return description.trim();
    }

    if (tagline.trim().isNotEmpty) {
      return tagline.trim();
    }

    return 'A gaming cafe ready for bookings, quick food, and community events.';
  }

  String get coverOrLogoImage {
    if (coverImage.trim().isNotEmpty) {
      return coverImage.trim();
    }

    return logoImage.trim();
  }

  static String? _formatTime(String value) {
    final normalized = value.trim();
    if (normalized.isEmpty) {
      return null;
    }

    final parts = normalized.split(':');
    if (parts.length < 2) {
      return null;
    }

    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) {
      return null;
    }

    final normalizedHour = ((hour % 24) + 24) % 24;
    final hourLabel = normalizedHour % 12 == 0 ? 12 : normalizedHour % 12;
    final period = normalizedHour >= 12 ? 'PM' : 'AM';
    final minuteLabel = minute.toString().padLeft(2, '0');
    return '$hourLabel:$minuteLabel $period';
  }

  static List<String> _readList(dynamic value) {
    if (value is List) {
      return value
          .map((item) => item.toString().trim())
          .where((item) => item.isNotEmpty)
          .toList();
    }
    if (value is String && value.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is List) {
          return decoded
              .map((item) => item.toString().trim())
              .where((item) => item.isNotEmpty)
              .toList();
        }
      } catch (_) {
        return const [];
      }
    }
    return const [];
  }
}
