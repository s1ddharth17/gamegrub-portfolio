class BusinessReview {
  final int id;
  final int businessId;
  final int userId;
  final int? billId;
  final int rating;
  final String title;
  final String reviewText;
  final String authorName;
  final String authorAvatar;
  final String createdAt;
  final String updatedAt;
  final bool isMine;

  const BusinessReview({
    required this.id,
    required this.businessId,
    required this.userId,
    required this.billId,
    required this.rating,
    required this.title,
    required this.reviewText,
    required this.authorName,
    required this.authorAvatar,
    required this.createdAt,
    required this.updatedAt,
    required this.isMine,
  });

  factory BusinessReview.fromJson(Map<String, dynamic> json) {
    return BusinessReview(
      id: int.tryParse('${json['review_id'] ?? 0}') ?? 0,
      businessId: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      userId: int.tryParse('${json['user_id'] ?? 0}') ?? 0,
      billId: json['bill_id'] == null
          ? null
          : int.tryParse('${json['bill_id']}'),
      rating: int.tryParse('${json['rating'] ?? 0}') ?? 0,
      title: '${json['review_title'] ?? ''}',
      reviewText: '${json['review_text'] ?? ''}',
      authorName: '${json['author_name'] ?? 'Verified player'}',
      authorAvatar: '${json['author_avatar'] ?? ''}',
      createdAt: '${json['created_at'] ?? ''}',
      updatedAt: '${json['updated_at'] ?? ''}',
      isMine: json['is_mine'] == true || '${json['is_mine']}' == '1',
    );
  }

  bool get hasTitle => title.trim().isNotEmpty;

  String get displayTitle =>
      hasTitle ? title.trim() : 'Rated ${rating.clamp(1, 5)} stars';

  String get dateLabel =>
      _formatDate(updatedAt.isNotEmpty ? updatedAt : createdAt);

  String get authorInitial {
    final trimmed = authorName.trim();
    if (trimmed.isEmpty) {
      return 'P';
    }
    return trimmed.substring(0, 1).toUpperCase();
  }
}

class BusinessReviewFeed {
  final int businessId;
  final String businessSlug;
  final String businessName;
  final double averageRating;
  final int reviewCount;
  final List<BusinessReview> reviews;

  const BusinessReviewFeed({
    required this.businessId,
    required this.businessSlug,
    required this.businessName,
    required this.averageRating,
    required this.reviewCount,
    required this.reviews,
  });

  factory BusinessReviewFeed.fromJson(Map<String, dynamic> json) {
    final reviewsJson = (json['reviews'] as List?) ?? const [];

    return BusinessReviewFeed(
      businessId: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      businessSlug: '${json['business_slug'] ?? ''}',
      businessName: '${json['business_name'] ?? ''}',
      averageRating: double.tryParse('${json['average_rating'] ?? 0}') ?? 0,
      reviewCount: int.tryParse('${json['review_count'] ?? 0}') ?? 0,
      reviews: reviewsJson
          .map(
            (item) =>
                BusinessReview.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList(),
    );
  }
}

class BusinessReviewState {
  final int businessId;
  final bool canReview;
  final String eligibilityReason;
  final int? proofBillId;
  final String proofBillCreatedAt;
  final BusinessReview? review;

  const BusinessReviewState({
    required this.businessId,
    required this.canReview,
    required this.eligibilityReason,
    required this.proofBillId,
    required this.proofBillCreatedAt,
    required this.review,
  });

  factory BusinessReviewState.fromJson(Map<String, dynamic> json) {
    final reviewJson = json['review'];

    return BusinessReviewState(
      businessId: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      canReview: json['can_review'] == true || '${json['can_review']}' == '1',
      eligibilityReason: '${json['eligibility_reason'] ?? ''}',
      proofBillId: json['proof_bill_id'] == null
          ? null
          : int.tryParse('${json['proof_bill_id']}'),
      proofBillCreatedAt: '${json['proof_bill_created_at'] ?? ''}',
      review: reviewJson is Map
          ? BusinessReview.fromJson(Map<String, dynamic>.from(reviewJson))
          : null,
    );
  }

  bool get hasExistingReview => review != null;

  String get gateMessage {
    if (canReview) {
      return hasExistingReview
          ? 'Your verified visit is already captured here. You can update your rating any time.'
          : 'Your completed visit unlocked reviews for this cafe. Share how the rigs, food, and service felt.';
    }

    return 'Reviews unlock after you complete a booking or checkout at this cafe.';
  }
}

String _formatDate(String rawValue) {
  final parsed = DateTime.tryParse(rawValue);
  if (parsed == null) {
    return 'Recently';
  }

  const months = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  final month = months[parsed.month - 1];
  return '$month ${parsed.day}, ${parsed.year}';
}
