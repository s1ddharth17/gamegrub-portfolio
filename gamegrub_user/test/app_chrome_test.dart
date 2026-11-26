import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/config/api_config.dart';
import 'package:gamegrub_user/widgets/app_chrome.dart';

void main() {
  test('resolveAppImageProvider returns a memory image for inline data', () {
    final provider = resolveAppImageProvider('data:image/png;base64,aGVsbG8=');

    expect(provider, isA<MemoryImage>());
  });

  test('resolveAppImageProvider returns a network image for upload paths', () {
    final provider = resolveAppImageProvider('menu/burger.png');

    expect(provider, isA<NetworkImage>());
    expect(
      (provider as NetworkImage).url,
      ApiConfig.resolveUpload('menu/burger.png'),
    );
  });

  testWidgets('AppResponsiveSplit stacks panels when space is constrained', (
    tester,
  ) async {
    const primaryKey = Key('primary');
    const secondaryKey = Key('secondary');

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 640,
              child: AppResponsiveSplit(
                spacing: 20,
                primaryFlex: 11,
                secondaryFlex: 10,
                minPrimaryWidth: 360,
                minSecondaryWidth: 340,
                primary: SizedBox(key: primaryKey, height: 120),
                secondary: SizedBox(key: secondaryKey, height: 80),
              ),
            ),
          ),
        ),
      ),
    );

    expect(
      tester.getTopLeft(find.byKey(secondaryKey)).dy,
      greaterThan(tester.getBottomLeft(find.byKey(primaryKey)).dy - 1),
    );
  });

  testWidgets('AppResponsiveSplit keeps panels side by side when room allows', (
    tester,
  ) async {
    const primaryKey = Key('primary');
    const secondaryKey = Key('secondary');

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 980,
              child: AppResponsiveSplit(
                spacing: 20,
                primaryFlex: 11,
                secondaryFlex: 10,
                minPrimaryWidth: 360,
                minSecondaryWidth: 340,
                primary: SizedBox(key: primaryKey, height: 120),
                secondary: SizedBox(key: secondaryKey, height: 80),
              ),
            ),
          ),
        ),
      ),
    );

    expect(
      tester.getTopLeft(find.byKey(primaryKey)).dy,
      equals(tester.getTopLeft(find.byKey(secondaryKey)).dy),
    );
    expect(
      tester.getTopLeft(find.byKey(secondaryKey)).dx,
      greaterThan(tester.getTopRight(find.byKey(primaryKey)).dx),
    );
  });
}
