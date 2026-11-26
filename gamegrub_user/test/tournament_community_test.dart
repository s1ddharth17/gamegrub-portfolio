import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/providers/tournament_provider.dart';
import 'package:gamegrub_user/services/tournament_service.dart';

void main() {
  test(
    'community provider keeps only published active posts in API order',
    () async {
      final service = _FakeTournamentService(
        communityResponse: [
          _communityPost(
            4,
            title: 'Priority winner',
            status: 'published',
            isActive: true,
            publishedAt: '2026-10-24T10:00:00.000Z',
          ),
          _communityPost(
            3,
            title: 'Draft',
            status: 'draft',
            isActive: true,
            publishedAt: '2026-10-24T10:00:00.000Z',
          ),
          _communityPost(
            2,
            title: 'Expired',
            status: 'published',
            isActive: false,
            publishedAt: '2026-10-24T10:00:00.000Z',
          ),
          _communityPost(
            1,
            title: 'Never published',
            status: 'published',
            isActive: true,
            publishedAt: null,
          ),
          _communityPost(
            5,
            title: 'Latest active',
            status: 'published',
            isActive: true,
            publishedAt: '2026-10-25T10:00:00.000Z',
          ),
        ],
      );
      final provider = TournamentProvider(service: service);
      addTearDown(provider.dispose);

      await provider.loadCommunityPosts();

      expect(provider.communityPosts.map((post) => post.title), [
        'Priority winner',
        'Latest active',
      ]);
      expect(
        provider.communityPosts.every((post) => post.isPubliclyVisible),
        isTrue,
      );
      expect(provider.communityPostsError, isNull);
      expect(provider.isCommunityPostsLoading, isFalse);
      expect(service.communityRequestCount, 1);
    },
  );

  test('community provider exposes a recoverable error state', () async {
    final provider = TournamentProvider(
      service: _FakeTournamentService(throwOnCommunity: true),
    );
    addTearDown(provider.dispose);

    await provider.loadCommunityPosts();

    expect(provider.communityPosts, isEmpty);
    expect(provider.communityPostsError, isNotNull);
    expect(provider.isCommunityPostsLoading, isFalse);
  });
}

Map<String, dynamic> _communityPost(
  int postId, {
  required String title,
  required String status,
  required bool isActive,
  required String? publishedAt,
}) => {
  'post_id': postId,
  'status': status,
  'content_type': 'spotlight',
  'accent_tone': 'orange',
  'title': title,
  'summary': 'A test community post.',
  'is_active_now': isActive,
  'published_at': publishedAt,
};

class _FakeTournamentService extends TournamentService {
  _FakeTournamentService({
    this.communityResponse = const [],
    this.throwOnCommunity = false,
  });

  final List<Map<String, dynamic>> communityResponse;
  final bool throwOnCommunity;
  int communityRequestCount = 0;

  @override
  Future<List> fetchCommunityPosts({int limit = 8}) async {
    communityRequestCount += 1;
    if (throwOnCommunity) {
      throw StateError('database connection details');
    }
    return communityResponse;
  }
}
