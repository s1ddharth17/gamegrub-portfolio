import '../config/api_config.dart';

class MenuItemModel {
  final int id;
  final int businessId;
  final String name;
  final double amount;
  final String image;
  final String category;
  final String description;
  final int prepTimeMinutes;
  final bool isAvailable;
  final bool isFeatured;

  MenuItemModel({
    required this.id,
    required this.businessId,
    required this.name,
    required this.amount,
    required this.image,
    required this.category,
    required this.description,
    required this.prepTimeMinutes,
    required this.isAvailable,
    required this.isFeatured,
  });

  factory MenuItemModel.fromJson(Map<String, dynamic> json) {
    return MenuItemModel(
      id: int.tryParse('${json['id'] ?? 0}') ?? 0,
      businessId: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      name: '${json['name'] ?? 'Menu item'}',
      amount: double.tryParse('${json['amount'] ?? 0}') ?? 0,
      image: '${json['image'] ?? ''}',
      category: '${json['category'] ?? 'Snacks'}',
      description: '${json['description'] ?? ''}',
      prepTimeMinutes: int.tryParse('${json['prep_time_minutes'] ?? 0}') ?? 0,
      isAvailable:
          json['is_available'] == true || '${json['is_available']}' == '1',
      isFeatured:
          json['is_featured'] == true || '${json['is_featured']}' == '1',
    );
  }

  String get imageUrl => ApiConfig.resolveUpload(image);
}
