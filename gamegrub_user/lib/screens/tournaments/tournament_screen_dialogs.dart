part of 'tournament_screen.dart';

class _TeamRegistrationDialog extends StatefulWidget {
  final Tournament tournament;
  final AppUser captain;
  final List<PersistentTournamentTeam> savedTeams;

  const _TeamRegistrationDialog({
    required this.tournament,
    required this.captain,
    required this.savedTeams,
  });

  @override
  State<_TeamRegistrationDialog> createState() =>
      _TeamRegistrationDialogState();
}

class _TeamRegistrationDialogState extends State<_TeamRegistrationDialog> {
  late final TextEditingController _teamNameController;
  late final List<_RosterFieldGroup> _rosterControllers;
  int? _selectedSavedTeamId;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _teamNameController = TextEditingController();
    _rosterControllers = List.generate(
      widget.tournament.teamSize > 1 ? widget.tournament.teamSize - 1 : 0,
      (_) => _RosterFieldGroup(),
    );
  }

  @override
  void dispose() {
    _teamNameController.dispose();
    for (final controller in _rosterControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  PersistentTournamentTeam? get _selectedSavedTeam {
    if (_selectedSavedTeamId == null) {
      return null;
    }

    for (final team in widget.savedTeams) {
      if (team.teamId == _selectedSavedTeamId) {
        return team;
      }
    }

    return null;
  }

  void _applySavedTeam(PersistentTournamentTeam? team) {
    if (team == null) {
      setState(() {
        _selectedSavedTeamId = null;
        _errorText = null;
      });
      return;
    }

    _teamNameController.text = team.teamName;
    final teammates = team.teammates;

    for (var index = 0; index < _rosterControllers.length; index++) {
      final teammate = index < teammates.length ? teammates[index] : null;
      _rosterControllers[index].populate(
        name: teammate?.memberName ?? '',
        email: teammate?.memberEmail ?? '',
        mobile: teammate?.memberMobile ?? '',
      );
    }

    setState(() {
      _selectedSavedTeamId = team.teamId;
      _errorText = null;
    });
  }

  void _submit() {
    final savedTeam = _selectedSavedTeam;
    if (savedTeam != null) {
      Navigator.of(context).pop(
        _TeamRegistrationDraft(
          teamId: savedTeam.teamId,
          teamName: savedTeam.teamName,
          roster: savedTeam.teammates
              .map(
                (member) => {
                  'member_name': member.memberName,
                  'member_email': member.memberEmail,
                  'member_mobile': member.memberMobile,
                },
              )
              .toList(),
        ),
      );
      return;
    }

    final teamName = _teamNameController.text.trim();
    if (teamName.isEmpty) {
      setState(() {
        _errorText = 'Team name is required.';
      });
      return;
    }

    final roster = <Map<String, dynamic>>[];
    for (var index = 0; index < _rosterControllers.length; index++) {
      final fields = _rosterControllers[index];
      final memberName = fields.nameController.text.trim();

      if (memberName.isEmpty) {
        setState(() {
          _errorText = 'Teammate ${index + 2} name is required.';
        });
        return;
      }

      roster.add({
        'member_name': memberName,
        'member_email': fields.emailController.text.trim(),
        'member_mobile': fields.mobileController.text.trim(),
      });
    }

    Navigator.of(context).pop(
      _TeamRegistrationDraft(teamId: null, teamName: teamName, roster: roster),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Register ${widget.tournament.teamLabel}'),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.savedTeams.isEmpty
                    ? 'Captain details will be taken from your account. Add the remaining roster below.'
                    : 'Captain details come from your account. Reuse a saved squad or build a custom roster for this event.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.surface.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.subtleBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Captain',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 6),
                    Text(widget.captain.name),
                    Text(
                      [
                        widget.captain.email,
                        if (widget.captain.mobile.isNotEmpty)
                          widget.captain.mobile,
                      ].join(' | '),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.savedTeams.isNotEmpty) ...[
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: _selectedSavedTeamId == null
                      ? 'custom'
                      : _selectedSavedTeamId.toString(),
                  decoration: buildAppInputDecoration(
                    label: 'Registration source',
                    hint: 'Choose how you want to fill this roster',
                    icon: Icons.fact_check_outlined,
                  ),
                  items: [
                    const DropdownMenuItem(
                      value: 'custom',
                      child: Text('Custom roster for this event'),
                    ),
                    ...widget.savedTeams.map(
                      (team) => DropdownMenuItem(
                        value: team.teamId.toString(),
                        child: Text(
                          '${team.displayName} - ${team.rosterCount} players',
                        ),
                      ),
                    ),
                  ],
                  onChanged: (value) {
                    if (value == null || value == 'custom') {
                      _applySavedTeam(null);
                      return;
                    }

                    final selectedTeamId = int.tryParse(value);
                    final selectedTeam = widget.savedTeams.where(
                      (team) => team.teamId == selectedTeamId,
                    );
                    _applySavedTeam(
                      selectedTeam.isEmpty ? null : selectedTeam.first,
                    );
                  },
                ),
                if (_selectedSavedTeam != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppTheme.success.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AppTheme.success.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Text(
                      'This registration will use your saved team exactly as-is. If the roster changed, update it from the My teams section first.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ),
                ],
              ],
              const SizedBox(height: 14),
              TextField(
                controller: _teamNameController,
                textCapitalization: TextCapitalization.words,
                readOnly: _selectedSavedTeam != null,
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                decoration: buildAppInputDecoration(
                  label: 'Team name',
                  hint: 'Enter your squad name',
                  icon: Icons.groups_outlined,
                ),
              ),
              for (
                var index = 0;
                index < _rosterControllers.length;
                index++
              ) ...[
                const SizedBox(height: 14),
                Text(
                  'Teammate ${index + 2}',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _rosterControllers[index].nameController,
                  textCapitalization: TextCapitalization.words,
                  readOnly: _selectedSavedTeam != null,
                  onTapOutside: (_) => FocusScope.of(context).unfocus(),
                  decoration: buildAppInputDecoration(
                    label: 'Player name',
                    hint: 'Enter teammate ${index + 2} name',
                    icon: Icons.person_outline,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _rosterControllers[index].emailController,
                  keyboardType: TextInputType.emailAddress,
                  readOnly: _selectedSavedTeam != null,
                  onTapOutside: (_) => FocusScope.of(context).unfocus(),
                  decoration: buildAppInputDecoration(
                    label: 'Email address (optional)',
                    hint: 'teammate@example.com',
                    icon: Icons.mail_outline,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _rosterControllers[index].mobileController,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  readOnly: _selectedSavedTeam != null,
                  onTapOutside: (_) => FocusScope.of(context).unfocus(),
                  decoration: buildAppInputDecoration(
                    label: 'Mobile number (optional)',
                    hint: '10-digit mobile number',
                    icon: Icons.phone_android_outlined,
                  ),
                ),
              ],
              if (_errorText != null) ...[
                const SizedBox(height: 14),
                Text(
                  _errorText!,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: AppTheme.danger),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Confirm team')),
      ],
    );
  }
}

class _PersistentTeamEditorDialog extends StatefulWidget {
  final AppUser captain;
  final PersistentTournamentTeam? initialTeam;

  const _PersistentTeamEditorDialog({
    required this.captain,
    required this.initialTeam,
  });

  @override
  State<_PersistentTeamEditorDialog> createState() =>
      _PersistentTeamEditorDialogState();
}

class _PersistentTeamEditorDialogState
    extends State<_PersistentTeamEditorDialog> {
  late final TextEditingController _teamNameController;
  late final TextEditingController _teamTagController;
  late final TextEditingController _preferredGameController;
  late final TextEditingController _teamBioController;
  late final List<_RosterFieldGroup> _rosterControllers;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    final initialTeam = widget.initialTeam;
    _teamNameController = TextEditingController(
      text: initialTeam?.teamName ?? '',
    );
    _teamTagController = TextEditingController(
      text: initialTeam?.teamTag ?? '',
    );
    _preferredGameController = TextEditingController(
      text: initialTeam?.preferredGame ?? '',
    );
    _teamBioController = TextEditingController(
      text: initialTeam?.teamBio ?? '',
    );
    final teammates =
        initialTeam?.teammates ?? const <PersistentTournamentTeamMember>[];
    _rosterControllers = teammates.isEmpty
        ? [_RosterFieldGroup()]
        : teammates
              .map(
                (member) => _RosterFieldGroup(
                  name: member.memberName,
                  email: member.memberEmail,
                  mobile: member.memberMobile,
                ),
              )
              .toList();
  }

  @override
  void dispose() {
    _teamNameController.dispose();
    _teamTagController.dispose();
    _preferredGameController.dispose();
    _teamBioController.dispose();
    for (final controller in _rosterControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  void _addTeammate() {
    if (_rosterControllers.length >= 5) {
      setState(() {
        _errorText = 'Reusable teams support up to 6 total players.';
      });
      return;
    }

    setState(() {
      _rosterControllers.add(_RosterFieldGroup());
      _errorText = null;
    });
  }

  void _removeTeammate(int index) {
    if (_rosterControllers.length <= 1) {
      setState(() {
        _errorText = 'Keep at least one teammate in a reusable team.';
      });
      return;
    }

    setState(() {
      final removed = _rosterControllers.removeAt(index);
      removed.dispose();
      _errorText = null;
    });
  }

  void _submit() {
    final teamName = _teamNameController.text.trim();
    if (teamName.isEmpty) {
      setState(() {
        _errorText = 'Team name is required.';
      });
      return;
    }

    final roster = <Map<String, dynamic>>[];
    for (var index = 0; index < _rosterControllers.length; index++) {
      final fields = _rosterControllers[index];
      final memberName = fields.nameController.text.trim();

      if (memberName.isEmpty) {
        setState(() {
          _errorText = 'Teammate ${index + 2} name is required.';
        });
        return;
      }

      roster.add({
        'member_name': memberName,
        'member_email': fields.emailController.text.trim(),
        'member_mobile': fields.mobileController.text.trim(),
      });
    }

    Navigator.of(context).pop(
      _PersistentTeamEditorDraft(
        teamName: teamName,
        teamTag: _teamTagController.text.trim(),
        preferredGame: _preferredGameController.text.trim(),
        teamBio: _teamBioController.text.trim(),
        roster: roster,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        widget.initialTeam == null ? 'Create reusable team' : 'Edit saved team',
      ),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Your captain details always come from your account. Save the rest of the roster here so future tournament registration is much faster.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.surface.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.subtleBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Captain',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 6),
                    Text(widget.captain.name),
                    Text(
                      [
                        widget.captain.email,
                        if (widget.captain.mobile.isNotEmpty)
                          widget.captain.mobile,
                      ].join(' | '),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _teamNameController,
                textCapitalization: TextCapitalization.words,
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                decoration: buildAppInputDecoration(
                  label: 'Team name',
                  hint: 'Enter your reusable squad name',
                  icon: Icons.groups_outlined,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _teamTagController,
                textCapitalization: TextCapitalization.characters,
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                decoration: buildAppInputDecoration(
                  label: 'Team tag (optional)',
                  hint: 'Example: GGA',
                  icon: Icons.sell_outlined,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _preferredGameController,
                textCapitalization: TextCapitalization.words,
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                decoration: buildAppInputDecoration(
                  label: 'Preferred game (optional)',
                  hint: 'Example: BGMI or Valorant',
                  icon: Icons.sports_esports_outlined,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _teamBioController,
                textCapitalization: TextCapitalization.sentences,
                minLines: 2,
                maxLines: 4,
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                decoration: buildAppInputDecoration(
                  label: 'Team bio (optional)',
                  hint: 'Add a short intro for this roster',
                  helper:
                      'A simple team summary makes saved rosters easier to recognise later.',
                  icon: Icons.description_outlined,
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Teammates',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _addTeammate,
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Add teammate'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ..._rosterControllers.asMap().entries.map(
                (entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.surface.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.subtleBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Teammate ${entry.key + 2}',
                                style: Theme.of(context).textTheme.titleSmall,
                              ),
                            ),
                            if (_rosterControllers.length > 1)
                              IconButton(
                                onPressed: () => _removeTeammate(entry.key),
                                icon: const Icon(Icons.delete_outline),
                                tooltip: 'Remove teammate',
                              ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: entry.value.nameController,
                          textCapitalization: TextCapitalization.words,
                          onTapOutside: (_) => FocusScope.of(context).unfocus(),
                          decoration: buildAppInputDecoration(
                            label: 'Player name',
                            hint: 'Enter teammate ${entry.key + 2} name',
                            icon: Icons.person_outline,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: entry.value.emailController,
                          keyboardType: TextInputType.emailAddress,
                          onTapOutside: (_) => FocusScope.of(context).unfocus(),
                          decoration: buildAppInputDecoration(
                            label: 'Email address (optional)',
                            hint: 'teammate@example.com',
                            icon: Icons.mail_outline,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: entry.value.mobileController,
                          keyboardType: TextInputType.phone,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(10),
                          ],
                          onTapOutside: (_) => FocusScope.of(context).unfocus(),
                          decoration: buildAppInputDecoration(
                            label: 'Mobile number (optional)',
                            hint: '10-digit mobile number',
                            icon: Icons.phone_android_outlined,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (_errorText != null) ...[
                const SizedBox(height: 8),
                Text(
                  _errorText!,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: AppTheme.danger),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(widget.initialTeam == null ? 'Save team' : 'Update team'),
        ),
      ],
    );
  }
}

class _TournamentPaymentDraft {
  final bool premiumAccess;
  final String paymentMethod;
  final String paymentReference;
  final String paymentNotes;

  const _TournamentPaymentDraft({
    required this.premiumAccess,
    required this.paymentMethod,
    required this.paymentReference,
    required this.paymentNotes,
  });
}

class _TournamentPaymentDialog extends StatefulWidget {
  final Tournament tournament;

  const _TournamentPaymentDialog({required this.tournament});

  @override
  State<_TournamentPaymentDialog> createState() =>
      _TournamentPaymentDialogState();
}

class _TournamentPaymentDialogState extends State<_TournamentPaymentDialog> {
  bool _premiumAccess = false;

  double get _totalDue =>
      widget.tournament.entryFee +
      (_premiumAccess ? widget.tournament.premiumEntryFee : 0);

  void _submit() {
    Navigator.of(context).pop(
      _TournamentPaymentDraft(
        premiumAccess: _premiumAccess,
        paymentMethod: '',
        paymentReference: '',
        paymentNotes: '',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Entry payment'),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _totalDue > 0
                    ? '${formatCurrency(_totalDue)} is due for this registration. Tournament staff will record payment when received.'
                    : 'This registration is free unless you add the premium option below.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              if (widget.tournament.hasPremiumOffer) ...[
                const SizedBox(height: 14),
                SwitchListTile.adaptive(
                  value: _premiumAccess,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    widget.tournament.premiumLabel.trim().isNotEmpty
                        ? widget.tournament.premiumLabel
                        : 'Premium access',
                  ),
                  subtitle: Text(
                    '${formatCurrency(widget.tournament.premiumEntryFee)}'
                    '${widget.tournament.premiumPerks.trim().isNotEmpty ? ' | ${widget.tournament.premiumPerks}' : ''}',
                  ),
                  onChanged: (value) {
                    setState(() {
                      _premiumAccess = value;
                    });
                  },
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(
            _totalDue > 0 ? 'Continue with payment pending' : 'Continue',
          ),
        ),
      ],
    );
  }
}
