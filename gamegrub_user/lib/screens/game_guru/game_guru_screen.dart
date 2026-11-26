import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/game_guru_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_chrome.dart';

class GameGuruScreen extends StatefulWidget {
  final String? initialQuery;

  const GameGuruScreen({super.key, this.initialQuery});

  @override
  State<GameGuruScreen> createState() => _GameGuruScreenState();
}

class _GameGuruScreenState extends State<GameGuruScreen> {
  static const List<String> _quickPrompts = [
    'Suggest a late-night gaming cafe with food',
    'Which setup is best for Valorant and CS2?',
    'Plan a snack and rig combo for a squad',
    'How do I extend my session without losing my seat?',
  ];

  late final TextEditingController _queryController;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _queryController = TextEditingController(text: widget.initialQuery ?? '');
  }

  @override
  void dispose() {
    _queryController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) {
      return;
    }

    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent + 220,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _submitPrompt([String? seededQuery]) async {
    final auth = context.read<AuthProvider>();
    final gameGuru = context.read<GameGuruProvider>();
    final query = (seededQuery ?? _queryController.text).trim();

    if (query.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Type what you want help with first.')),
      );
      return;
    }

    _queryController.clear();
    FocusScope.of(context).unfocus();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());

    final token = auth.token;
    if (token == null || token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please log in again to use GameGuru.')),
      );
      return;
    }

    final success = await gameGuru.sendQuery(token: token, query: query);

    if (!mounted) {
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());

    if (success) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          gameGuru.errorMessage ?? 'GameGuru is unavailable right now.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final gameGuru = context.watch<GameGuruProvider>();
    final turns = gameGuru.conversation;
    final firstName = auth.user?.name.trim().split(' ').first ?? 'Player';

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(
                    AppSpace.lg,
                    AppSpace.lg,
                    AppSpace.lg,
                    AppSpace.lg,
                  ),
                  children: [
                    AppReveal(
                      child: AppHeroBanner(
                        eyebrow: 'GAMEGURU',
                        title: turns.isEmpty
                            ? 'Ask for the best cafe, rig, or snack combo'
                            : 'Live tips for your next gaming plan',
                        subtitle: turns.isEmpty
                            ? 'Use GameGuru like a gaming concierge. Ask about cafes, tournaments, hardware, or food before you lock in tonight.'
                            : 'Keep the conversation going for better cafe picks, faster booking decisions, and smarter session upgrades.',
                        icon: Icons.auto_awesome_rounded,
                        accent: AppTheme.primaryTurquoise,
                        trailing: GlassPanel(
                          padding: const EdgeInsets.all(AppSpace.lg),
                          glowColor: AppTheme.primaryOrange,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Assistant mode',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: AppTheme.secondaryText),
                              ),
                              const SizedBox(height: AppSpace.xs),
                              Text(
                                turns.isEmpty
                                    ? 'Ready for $firstName'
                                    : 'Conversation live',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: AppSpace.xs),
                              Text(
                                turns.isEmpty
                                    ? 'Tap a suggested prompt or type your own question below.'
                                    : '${turns.length} replies saved in this thread.',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: AppTheme.secondaryText),
                              ),
                            ],
                          ),
                        ),
                        stats: [
                          AppMetricTile(
                            label: 'Quick prompts',
                            value: '${_quickPrompts.length}',
                            caption: 'Ready-made asks for fast discovery.',
                            accent: AppTheme.primaryOrange,
                            icon: Icons.flash_on_rounded,
                          ),
                          AppMetricTile(
                            label: 'Conversation',
                            value: turns.isEmpty
                                ? 'Fresh'
                                : '${turns.length} turns',
                            caption: turns.isEmpty
                                ? 'No messages yet.'
                                : 'Includes your most recent strategy and booking questions.',
                            accent: AppTheme.primaryTurquoise,
                            icon: Icons.chat_bubble_outline_rounded,
                          ),
                        ],
                        actions: [
                          if (turns.isNotEmpty)
                            OutlinedButton.icon(
                              onPressed: gameGuru.isLoading
                                  ? null
                                  : gameGuru.clear,
                              icon: const Icon(Icons.delete_outline_rounded),
                              label: const Text('Clear chat'),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.lg),
                    AppReveal(
                      delay: AppMotion.fast,
                      child: _PromptScroller(
                        prompts: _quickPrompts,
                        onSelected: _submitPrompt,
                      ),
                    ),
                    const SizedBox(height: AppSpace.lg),
                    if (turns.isEmpty && gameGuru.pendingQuery == null)
                      AppReveal(
                        delay: AppMotion.normal,
                        child: _GuruEmptyState(
                          firstName: firstName,
                          onPromptTap: _submitPrompt,
                        ),
                      )
                    else ...[
                      for (final turn in turns) ...[
                        const SizedBox(height: AppSpace.md),
                        _UserBubble(text: turn.query),
                        const SizedBox(height: AppSpace.sm),
                        _AssistantBubble(
                          title: turn.hasError
                              ? 'Need another try'
                              : 'GameGuru',
                          text: turn.hasError
                              ? (turn.error ?? 'Something went wrong.')
                              : turn.response!.assistantMessage,
                          accent: turn.hasError
                              ? AppTheme.danger
                              : AppTheme.primaryTurquoise,
                        ),
                      ],
                      if (gameGuru.pendingQuery != null) ...[
                        const SizedBox(height: AppSpace.md),
                        _UserBubble(text: gameGuru.pendingQuery!),
                        const SizedBox(height: AppSpace.sm),
                        const _TypingBubble(),
                      ],
                    ],
                    const SizedBox(height: 120),
                  ],
                ),
              ),
              _Composer(
                controller: _queryController,
                isLoading: gameGuru.isLoading,
                onSend: _submitPrompt,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PromptScroller extends StatelessWidget {
  final List<String> prompts;
  final ValueChanged<String> onSelected;

  const _PromptScroller({required this.prompts, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: prompts.length,
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final prompt = prompts[index];
          return AppInteractiveSurface(
            onTap: () => onSelected(prompt),
            borderRadius: const BorderRadius.all(Radius.circular(999)),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpace.md,
                vertical: AppSpace.sm,
              ),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.94),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppTheme.subtleBorder),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.auto_awesome_rounded,
                    size: 18,
                    color: AppTheme.primaryOrange,
                  ),
                  const SizedBox(width: AppSpace.xs),
                  Text(
                    prompt,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppTheme.primaryText,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _GuruEmptyState extends StatelessWidget {
  final String firstName;
  final ValueChanged<String> onPromptTap;

  const _GuruEmptyState({required this.firstName, required this.onPromptTap});

  @override
  Widget build(BuildContext context) {
    final starterPrompts = const [
      'Best cafes for squads',
      'Tournaments nearby',
      'Low-latency setups',
    ];

    return GlassPanel(
      padding: const EdgeInsets.all(AppSpace.xl),
      borderRadius: const BorderRadius.all(Radius.circular(28)),
      glowColor: AppTheme.primaryTurquoise,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AppIconOrb(
                icon: Icons.psychology_alt_rounded,
                accent: AppTheme.primaryTurquoise,
                size: 52,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Hi $firstName, what do you want help with tonight?',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: AppSpace.xs),
                    Text(
                      'Ask for quick recommendations, booking advice, or gaming-food pairings before you commit to a cafe.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: starterPrompts
                .map(
                  (prompt) => FilledButton.tonalIcon(
                    onPressed: () => onPromptTap(prompt),
                    icon: const Icon(Icons.flash_on_rounded),
                    label: Text(prompt),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _AssistantBubble extends StatelessWidget {
  final String title;
  final String text;
  final Color accent;

  const _AssistantBubble({
    required this.title,
    required this.text,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: GlassPanel(
          glowColor: accent,
          borderRadius: const BorderRadius.all(Radius.circular(28)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GlowBadge(
                label: title,
                color: accent,
                icon: Icons.auto_awesome_rounded,
              ),
              const SizedBox(height: AppSpace.md),
              Text(
                text,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: accent == AppTheme.danger
                      ? AppTheme.danger
                      : AppTheme.primaryText,
                  height: 1.72,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UserBubble extends StatelessWidget {
  final String text;

  const _UserBubble({required this.text});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.md,
            vertical: AppSpace.md,
          ),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppTheme.primaryOrange, AppTheme.hoverOrange],
            ),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(24),
              topRight: Radius.circular(24),
              bottomLeft: Radius.circular(24),
              bottomRight: Radius.circular(10),
            ),
            boxShadow: [
              BoxShadow(
                color: AppTheme.primaryOrange.withValues(alpha: 0.16),
                blurRadius: 18,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 220),
        child: GlassPanel(
          borderRadius: const BorderRadius.all(Radius.circular(24)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: const [
              _Dot(),
              SizedBox(width: 6),
              _Dot(delay: 120),
              SizedBox(width: 6),
              _Dot(delay: 240),
            ],
          ),
        ),
      ),
    );
  }
}

class _Dot extends StatefulWidget {
  final int delay;

  const _Dot({this.delay = 0});

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final progress = (_controller.value + widget.delay / 1000) % 1;
        final opacity = 0.35 + (progress * 0.65);

        return Opacity(
          opacity: opacity.clamp(0.35, 1),
          child: Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              color: AppTheme.primaryTurquoise,
              shape: BoxShape.circle,
            ),
          ),
        );
      },
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final bool isLoading;
  final VoidCallback onSend;

  const _Composer({
    required this.controller,
    required this.isLoading,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      child: GlassPanel(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        borderRadius: const BorderRadius.all(Radius.circular(28)),
        glowColor: AppTheme.primaryOrange,
        shadowStrength: 1.15,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                textInputAction: TextInputAction.send,
                minLines: 1,
                maxLines: 4,
                onSubmitted: (_) => onSend(),
                decoration: buildAppInputDecoration(
                  label: 'Ask GameGuru',
                  hint:
                      'Ask about cafes, PCs, snacks, bookings, or tournaments',
                  icon: Icons.auto_awesome_outlined,
                  border: InputBorder.none,
                ),
              ),
            ),
            const SizedBox(width: AppSpace.sm),
            FilledButton(
              onPressed: isLoading ? null : onSend,
              style: FilledButton.styleFrom(
                minimumSize: const Size(52, 52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
              child: isLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.send_rounded),
            ),
          ],
        ),
      ),
    );
  }
}
