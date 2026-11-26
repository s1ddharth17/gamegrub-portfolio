import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../services/tournament_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_chrome.dart';

class TournamentPlayerFinderScreen extends StatefulWidget {
  final String token;

  const TournamentPlayerFinderScreen({super.key, required this.token});

  @override
  State<TournamentPlayerFinderScreen> createState() =>
      _TournamentPlayerFinderScreenState();
}

class _TournamentPlayerFinderScreenState
    extends State<TournamentPlayerFinderScreen> {
  final _service = TournamentService();
  final _profileCity = TextEditingController();
  final _profileState = TextEditingController();
  final _gameFilter = TextEditingController();
  final _cityFilter = TextEditingController();
  final _stateFilter = TextEditingController();
  bool _isPublic = false;
  bool _lookingForTeam = false;
  bool _onlyLookingForTeam = false;
  bool _loading = true;
  bool _saving = false;
  String _profileSkill = 'open';
  String _skillFilter = '';
  String? _error;
  List<Map<String, dynamic>> _players = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _profileCity.dispose();
    _profileState.dispose();
    _gameFilter.dispose();
    _cityFilter.dispose();
    _stateFilter.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await _service.fetchTournamentPlayerProfile(
        token: widget.token,
      );
      _isPublic = profile['is_public'] == true;
      _lookingForTeam = profile['looking_for_team'] == true;
      _profileSkill = '${profile['skill_level'] ?? 'open'}';
      _profileCity.text = '${profile['city'] ?? ''}';
      _profileState.text = '${profile['state'] ?? ''}';
      await _searchPlayers();
    } catch (_) {
      _error = 'Player finder could not load. Check your connection and retry.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _searchPlayers() async {
    try {
      final players = await _service.fetchPublicTournamentPlayers(
        game: _gameFilter.text,
        city: _cityFilter.text,
        state: _stateFilter.text,
        skillLevel: _skillFilter,
        lookingForTeam: _onlyLookingForTeam,
      );
      _players = players
          .whereType<Map>()
          .map((player) => Map<String, dynamic>.from(player))
          .toList();
    } catch (_) {
      _error = 'Player results could not load. Check your filters and retry.';
      _players = [];
    }
    if (mounted) setState(() {});
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    try {
      await _service.updateTournamentPlayerProfile(
        token: widget.token,
        profile: <String, dynamic>{
          'is_public': _isPublic,
          'looking_for_team': _lookingForTeam,
          'skill_level': _profileSkill,
          'city': _profileCity.text.trim(),
          'state': _profileState.text.trim(),
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isPublic
                  ? 'Your player profile is visible in discovery.'
                  : 'Player discovery is turned off for your profile.',
            ),
          ),
        );
      }
      await _searchPlayers();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile settings could not be saved.')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _textField(
    TextEditingController controller,
    String label, {
    IconData? icon,
  }) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: icon == null ? null : Icon(icon),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Find tournament players')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
                children: [
                  AppSectionTitle(
                    title: 'Your discovery profile',
                    subtitle:
                        'Choose what other players can see. Contact details are never shown in player discovery.',
                  ),
                  const SizedBox(height: 12),
                  GlassPanel(
                    child: Column(
                      children: [
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Show my player profile'),
                          subtitle: const Text(
                            'Share your display name, game, bio, skill, and city.',
                          ),
                          value: _isPublic,
                          onChanged: (value) => setState(() {
                            _isPublic = value;
                            if (!value) _lookingForTeam = false;
                          }),
                        ),
                        if (_isPublic) ...[
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('I am looking for a team'),
                            value: _lookingForTeam,
                            onChanged: (value) =>
                                setState(() => _lookingForTeam = value),
                          ),
                          DropdownButtonFormField<String>(
                            initialValue: _profileSkill,
                            decoration: const InputDecoration(
                              labelText: 'Your skill level',
                            ),
                            items: const [
                              DropdownMenuItem(
                                value: 'open',
                                child: Text('Open to all levels'),
                              ),
                              DropdownMenuItem(
                                value: 'beginner',
                                child: Text('Beginner'),
                              ),
                              DropdownMenuItem(
                                value: 'intermediate',
                                child: Text('Intermediate'),
                              ),
                              DropdownMenuItem(
                                value: 'advanced',
                                child: Text('Advanced'),
                              ),
                            ],
                            onChanged: (value) {
                              if (value != null) {
                                setState(() => _profileSkill = value);
                              }
                            },
                          ),
                          const SizedBox(height: 10),
                          _textField(_profileCity, 'City'),
                          const SizedBox(height: 10),
                          _textField(_profileState, 'State / region'),
                        ],
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: _saving ? null : _saveProfile,
                            icon: _saving
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.save_outlined),
                            label: Text(_saving ? 'Saving…' : 'Save profile'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),
                  AppSectionTitle(
                    title: 'Discover players',
                    subtitle:
                        'Filter public profiles by game, location, and skill.',
                  ),
                  const SizedBox(height: 12),
                  GlassPanel(
                    child: Column(
                      children: [
                        _textField(
                          _gameFilter,
                          'Game',
                          icon: Icons.sports_esports_outlined,
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(child: _textField(_cityFilter, 'City')),
                            const SizedBox(width: 10),
                            Expanded(child: _textField(_stateFilter, 'State')),
                          ],
                        ),
                        const SizedBox(height: 10),
                        DropdownButtonFormField<String>(
                          initialValue: _skillFilter,
                          decoration: const InputDecoration(
                            labelText: 'Skill level',
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: '',
                              child: Text('Any level'),
                            ),
                            DropdownMenuItem(
                              value: 'beginner',
                              child: Text('Beginner'),
                            ),
                            DropdownMenuItem(
                              value: 'intermediate',
                              child: Text('Intermediate'),
                            ),
                            DropdownMenuItem(
                              value: 'advanced',
                              child: Text('Advanced'),
                            ),
                          ],
                          onChanged: (value) =>
                              setState(() => _skillFilter = value ?? ''),
                        ),
                        CheckboxListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Only players looking for a team'),
                          value: _onlyLookingForTeam,
                          onChanged: (value) => setState(
                            () => _onlyLookingForTeam = value ?? false,
                          ),
                        ),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _searchPlayers,
                            icon: const Icon(Icons.search_rounded),
                            label: const Text('Search players'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (_error != null)
                    GlassPanel(
                      child: Row(
                        children: [
                          Expanded(child: Text(_error!)),
                          TextButton(
                            onPressed: _load,
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    )
                  else if (_players.isEmpty)
                    const EmptyGlassState(
                      title: 'No public players found',
                      message:
                          'Try a wider search or invite teammates to opt in to player discovery.',
                      icon: Icons.groups_outlined,
                    )
                  else
                    ..._players.map((player) {
                      final name = '${player['display_name'] ?? 'Player'}';
                      final city = [player['city'], player['state']]
                          .whereType<String>()
                          .where((part) => part.trim().isNotEmpty)
                          .join(', ');
                      final game = '${player['favorite_game'] ?? ''}';
                      final bio = '${player['player_bio'] ?? ''}';
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: GlassPanel(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              CircleAvatar(
                                backgroundColor: AppTheme.raisedSurface,
                                child: Icon(Icons.person_outline_rounded),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      name,
                                      style: Theme.of(
                                        context,
                                      ).textTheme.titleMedium,
                                    ),
                                    if (game.isNotEmpty)
                                      Text(
                                        game,
                                        style: Theme.of(
                                          context,
                                        ).textTheme.bodySmall,
                                      ),
                                    if (city.isNotEmpty)
                                      Text(
                                        city,
                                        style: Theme.of(
                                          context,
                                        ).textTheme.bodySmall,
                                      ),
                                    Text(
                                      '${player['skill_level'] ?? 'open'}${player['looking_for_team'] == true ? ' · Looking for a team' : ''}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color: AppTheme.lightTurquoise,
                                          ),
                                    ),
                                    if (bio.trim().isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        bio,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                              color: AppTheme.secondaryText,
                                            ),
                                      ),
                                    ],
                                    Align(
                                      alignment: Alignment.centerLeft,
                                      child: TextButton.icon(
                                        onPressed: () => SharePlus.instance.share(
                                          ShareParams(
                                            title:
                                                'GameGrub player profile: $name',
                                            text: [
                                              'Find $name on GameGrub Tournament Player Finder.',
                                              if (game.trim().isNotEmpty)
                                                'Game: $game',
                                              'Skill: ${player['skill_level'] ?? 'open'}',
                                              if (city.isNotEmpty)
                                                'Location: $city',
                                              if (player['looking_for_team'] ==
                                                  true)
                                                'Looking for a team',
                                            ].join('\n'),
                                          ),
                                        ),
                                        icon: const Icon(Icons.share_outlined),
                                        label: const Text('Share profile'),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                ],
              ),
      ),
    );
  }
}
