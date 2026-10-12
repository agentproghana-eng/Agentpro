import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final shared =
      File('lib/shared/widgets/community_widgets.dart').readAsStringSync();
  final agent =
      File('lib/features/community/community_feed_screen.dart').readAsStringSync();
  final personal = File(
          'lib/features/personal_community/personal_community_feed_screen.dart')
      .readAsStringSync();

  test('shared community widgets exist', () {
    for (final name in [
      'class CommunityPostCard',
      'class CommunityComposerBar',
      'class CommunityComposerPanel',
      'class CommunitySkeletonList',
      'class CommunityStateCard',
      'String communityActionError',
      'String formatCommunityTime',
    ]) {
      expect(shared, contains(name));
    }
  });

  test('both communities use the shared widgets', () {
    for (final src in [agent, personal]) {
      expect(src, contains('community_widgets.dart'));
      expect(src, contains('CommunityPostCard('));
      expect(src, contains('CommunityComposerBar('));
      expect(src, contains('CommunitySkeletonList()'));
      expect(src, contains('CommunityStateCard('));
      expect(src, contains('communityActionError('));
      expect(src, contains('_maxRecordSeconds = 120'));
    }
    expect(agent, contains('showTypeAndRole: true'));
    expect(personal, isNot(contains('showTypeAndRole: true')));
  });

  test('personal community keeps the paid gate', () {
    expect(personal, contains('Upgrade to Paid to post in the community'));
    expect(personal, contains("context.push('/personal-subscription')"));
  });

  test('reactions are optimistic, not a full reload', () {
    expect(personal, contains('post[\'my_reaction\'] = previousReaction'));
    expect(personal, isNot(contains('_load();\n    } catch (e) {\n      if (mounted) {\n        ScaffoldMessenger')));
  });
}
