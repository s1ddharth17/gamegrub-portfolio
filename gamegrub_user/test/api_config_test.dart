import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/config/api_config.dart';

void main() {
  test('inferHostedWebOrigin keeps hosted https origins', () {
    expect(
      ApiConfig.inferHostedWebOrigin(
        Uri.parse('https://play.gamegrub.app/menu'),
        webEnabled: true,
      ),
      'https://play.gamegrub.app',
    );
  });

  test('inferHostedWebOrigin ignores local development hosts', () {
    expect(
      ApiConfig.inferHostedWebOrigin(
        Uri.parse('http://localhost:4174/food'),
        webEnabled: true,
      ),
      isNull,
    );
  });

  test('resolveUpload preserves inline data images', () {
    const inlineImage = 'data:image/png;base64,aGVsbG8=';

    expect(ApiConfig.resolveUpload(inlineImage), inlineImage);
  });

  test('resolveUpload keeps existing uploads paths stable', () {
    expect(
      ApiConfig.resolveUpload('/uploads/tournaments/cover.png'),
      '${ApiConfig.rootUrl}/uploads/tournaments/cover.png',
    );
    expect(
      ApiConfig.resolveUpload('uploads/tournaments/cover.png'),
      '${ApiConfig.rootUrl}/uploads/tournaments/cover.png',
    );
  });
}
