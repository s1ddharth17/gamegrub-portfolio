import 'pc.dart';

class GameGuruResponse {
  final String query;
  final String mode;
  final String? model;
  final DateTime? generatedAt;
  final String summary;
  final String followUpQuestion;
  final String budgetMode;
  final String queryScope;
  final String foodGoal;
  final String? preferredPcCategory;
  final String? preferredFoodCategory;
  final bool wantsBestSellerFood;
  final List<String> quickTips;
  final GameGuruPcRecommendation? bestPc;
  final List<GameGuruPcRecommendation> pcAlternatives;
  final GameGuruFoodRecommendation? bestFood;
  final List<GameGuruFoodRecommendation> foodAlternatives;
  final GameGuruSnapshot marketSnapshot;

  GameGuruResponse({
    required this.query,
    required this.mode,
    required this.model,
    required this.generatedAt,
    required this.summary,
    required this.followUpQuestion,
    required this.budgetMode,
    required this.queryScope,
    required this.foodGoal,
    required this.preferredPcCategory,
    required this.preferredFoodCategory,
    required this.wantsBestSellerFood,
    required this.quickTips,
    required this.bestPc,
    required this.pcAlternatives,
    required this.bestFood,
    required this.foodAlternatives,
    required this.marketSnapshot,
  });

  factory GameGuruResponse.fromJson(Map<String, dynamic> json) {
    final signals = Map<String, dynamic>.from(
      (json['signals'] as Map?) ?? const <String, dynamic>{},
    );
    final quickTips =
        (json['quick_tips'] as List?)
            ?.map((item) => item.toString())
            .where((item) => item.trim().isNotEmpty)
            .toList() ??
        const <String>[];

    return GameGuruResponse(
      query: '${json['query'] ?? ''}',
      mode: '${json['mode'] ?? 'rules'}',
      model: json['model']?.toString(),
      generatedAt: DateTime.tryParse('${json['generated_at'] ?? ''}'),
      summary: '${json['summary'] ?? ''}',
      followUpQuestion: '${json['follow_up_question'] ?? ''}',
      budgetMode: '${signals['budget_mode'] ?? 'balanced'}',
      queryScope: '${signals['query_scope'] ?? 'general'}',
      foodGoal: '${signals['food_goal'] ?? 'balanced'}',
      preferredPcCategory: signals['preferred_pc_category']?.toString(),
      preferredFoodCategory: signals['preferred_food_category']?.toString(),
      wantsBestSellerFood:
          signals['wants_bestseller_food'] == true ||
          '${signals['wants_bestseller_food']}' == 'true',
      quickTips: quickTips,
      bestPc: _pcFromDynamic(json['best_pc']),
      pcAlternatives:
          (json['pc_alternatives'] as List?)
              ?.map((item) => _pcFromDynamic(item))
              .whereType<GameGuruPcRecommendation>()
              .toList() ??
          const <GameGuruPcRecommendation>[],
      bestFood: _foodFromDynamic(json['best_food']),
      foodAlternatives:
          (json['food_alternatives'] as List?)
              ?.map((item) => _foodFromDynamic(item))
              .whereType<GameGuruFoodRecommendation>()
              .toList() ??
          const <GameGuruFoodRecommendation>[],
      marketSnapshot: GameGuruSnapshot.fromJson(
        Map<String, dynamic>.from(
          (json['market_snapshot'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
    );
  }

  bool get isAiMode => mode.toLowerCase() == 'ai';
  bool get isFoodFocused => queryScope.toLowerCase() == 'food';
  bool get isPcFocused => queryScope.toLowerCase() == 'pc';

  String get assistantMessage {
    final sections = <String>[];
    final cleanSummary = summary.trim();
    if (cleanSummary.isNotEmpty) {
      sections.add(cleanSummary);
    }

    if (isFoodFocused) {
      if (bestFood != null) {
        sections.add(_buildFoodSection(bestFood!));
      }
    } else if (isPcFocused) {
      if (bestPc != null) {
        sections.add(_buildPcSection(bestPc!));
      }
    } else {
      if (bestPc != null) {
        sections.add(_buildPcSection(bestPc!));
      }

      if (bestFood != null) {
        sections.add(_buildFoodSection(bestFood!));
      }
    }

    final alternatives = isFoodFocused
        ? foodAlternatives.map((food) => food.name).take(3).toList()
        : isPcFocused
        ? pcAlternatives.map((pc) => pc.title).take(3).toList()
        : <String>[
            ...pcAlternatives.map((pc) => pc.title),
            ...foodAlternatives.map((food) => food.name),
          ].take(4).toList();
    if (alternatives.isNotEmpty) {
      sections.add('Also available: ${alternatives.join(', ')}');
    }

    return sections.where((section) => section.trim().isNotEmpty).join('\n\n');
  }

  static String _buildPcSection(GameGuruPcRecommendation recommendation) {
    final lines = <String>[
      '${recommendation.title} - ${recommendation.categoryLabel} - ${_formatCurrency(recommendation.pricePerHour)}/hr - ${recommendation.availabilityLabel}',
    ];
    if (recommendation.reason.trim().isNotEmpty) {
      lines.add(recommendation.reason.trim());
    }
    return lines.join('\n');
  }

  static String _buildFoodSection(GameGuruFoodRecommendation recommendation) {
    final subtitle = <String>[
      _formatCurrency(recommendation.amount),
      recommendation.category,
      if (recommendation.prepTimeMinutes > 0)
        '${recommendation.prepTimeMinutes} min',
    ].join(' | ');

    final lines = <String>['${recommendation.name} | $subtitle'];
    if (recommendation.reason.trim().isNotEmpty) {
      lines.add(recommendation.reason.trim());
    }
    return lines.join('\n');
  }

  static String _formatCurrency(double value) {
    final normalized = value % 1 == 0
        ? value.toStringAsFixed(0)
        : value.toStringAsFixed(2);
    return 'Rs $normalized';
  }

  static GameGuruPcRecommendation? _pcFromDynamic(dynamic value) {
    if (value is! Map) {
      return null;
    }

    return GameGuruPcRecommendation.fromJson(Map<String, dynamic>.from(value));
  }

  static GameGuruFoodRecommendation? _foodFromDynamic(dynamic value) {
    if (value is! Map) {
      return null;
    }

    return GameGuruFoodRecommendation.fromJson(
      Map<String, dynamic>.from(value),
    );
  }
}

class GameGuruTurn {
  final String query;
  final GameGuruResponse? response;
  final String? error;
  final DateTime createdAt;

  GameGuruTurn({
    required this.query,
    this.response,
    this.error,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  bool get hasError => (error ?? '').trim().isNotEmpty;
}

class GameGuruPcRecommendation {
  final int pcId;
  final String title;
  final String specs;
  final String category;
  final String categoryLabel;
  final double pricePerHour;
  final String status;
  final String liveState;
  final String availabilityLabel;
  final bool canReserve;
  final int totalSessions;
  final int recentSessions;
  final String reason;

  GameGuruPcRecommendation({
    required this.pcId,
    required this.title,
    required this.specs,
    required this.category,
    required this.categoryLabel,
    required this.pricePerHour,
    required this.status,
    required this.liveState,
    required this.availabilityLabel,
    required this.canReserve,
    required this.totalSessions,
    required this.recentSessions,
    required this.reason,
  });

  factory GameGuruPcRecommendation.fromJson(Map<String, dynamic> json) {
    return GameGuruPcRecommendation(
      pcId: int.tryParse('${json['pc_id'] ?? 0}') ?? 0,
      title: '${json['title'] ?? 'PC'}',
      specs: '${json['specs'] ?? 'Gaming setup'}',
      category: '${json['category'] ?? 'esports_pc'}',
      categoryLabel: '${json['category_label'] ?? 'PC'}',
      pricePerHour:
          double.tryParse('${json['price_per_hour'] ?? json['price'] ?? 0}') ??
          0,
      status: '${json['status'] ?? 'active'}',
      liveState: '${json['live_state'] ?? 'free'}',
      availabilityLabel: '${json['availability_label'] ?? 'Available'}',
      canReserve:
          json['can_reserve'] == true || '${json['can_reserve']}' == 'true',
      totalSessions: int.tryParse('${json['total_sessions'] ?? 0}') ?? 0,
      recentSessions: int.tryParse('${json['recent_sessions'] ?? 0}') ?? 0,
      reason: '${json['reason'] ?? ''}',
    );
  }

  PC toPc() {
    return PC(
      id: pcId,
      businessId: 0,
      specs: specs,
      category: category,
      price: pricePerHour,
      status: status,
      bookingId: null,
      liveState: liveState,
      elapsedMinutes: null,
      remainingMinutes: null,
      overtimeMinutes: null,
    );
  }
}

class GameGuruFoodRecommendation {
  final int menuId;
  final String name;
  final double amount;
  final String image;
  final String category;
  final String description;
  final int prepTimeMinutes;
  final bool isAvailable;
  final bool isFeatured;
  final int totalQtySold;
  final double totalRevenue;
  final int bestsellerRank;
  final String reason;

  GameGuruFoodRecommendation({
    required this.menuId,
    required this.name,
    required this.amount,
    required this.image,
    required this.category,
    required this.description,
    required this.prepTimeMinutes,
    required this.isAvailable,
    required this.isFeatured,
    required this.totalQtySold,
    required this.totalRevenue,
    required this.bestsellerRank,
    required this.reason,
  });

  factory GameGuruFoodRecommendation.fromJson(Map<String, dynamic> json) {
    return GameGuruFoodRecommendation(
      menuId: int.tryParse('${json['menu_id'] ?? json['id'] ?? 0}') ?? 0,
      name: '${json['name'] ?? 'Menu item'}',
      amount: double.tryParse('${json['amount'] ?? 0}') ?? 0,
      image: '${json['image'] ?? ''}',
      category: '${json['category'] ?? 'Snacks'}',
      description: '${json['description'] ?? ''}',
      prepTimeMinutes: int.tryParse('${json['prep_time_minutes'] ?? 0}') ?? 0,
      isAvailable:
          json['is_available'] == true || '${json['is_available']}' == 'true',
      isFeatured:
          json['is_featured'] == true || '${json['is_featured']}' == 'true',
      totalQtySold: int.tryParse('${json['total_qty_sold'] ?? 0}') ?? 0,
      totalRevenue: double.tryParse('${json['total_revenue'] ?? 0}') ?? 0,
      bestsellerRank: int.tryParse('${json['bestseller_rank'] ?? 0}') ?? 0,
      reason: '${json['reason'] ?? ''}',
    );
  }
}

class GameGuruSnapshot {
  final GameGuruFoodRecommendation? bestsellerFood;
  final GameGuruPcRecommendation? mostBookedPc;

  GameGuruSnapshot({required this.bestsellerFood, required this.mostBookedPc});

  factory GameGuruSnapshot.fromJson(Map<String, dynamic> json) {
    return GameGuruSnapshot(
      bestsellerFood: GameGuruResponse._foodFromDynamic(
        json['bestseller_food'],
      ),
      mostBookedPc: GameGuruResponse._pcFromDynamic(json['most_booked_pc']),
    );
  }
}
