import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/notification_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/notification_navigation.dart';

class NotificationCenterScreen extends StatefulWidget {
  const NotificationCenterScreen({super.key});

  @override
  State<NotificationCenterScreen> createState() =>
      _NotificationCenterScreenState();
}

class _NotificationCenterScreenState extends State<NotificationCenterScreen> {
  static const _timezones = [
    'Asia/Kolkata',
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Singapore',
    'Australia/Sydney',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final token = context.read<AuthProvider>().token;
    if (token != null && token.isNotEmpty) {
      await context.read<NotificationProvider>().load(token);
    }
  }

  Future<void> _openNotification(
    NotificationProvider provider,
    String token,
    Map<String, dynamic> item,
  ) async {
    final id = int.tryParse(item['notification_id'].toString());
    if (id != null) await provider.markRead(token, id);
    if (!mounted) return;
    NotificationNavigation.open(
      item['deep_link']?.toString() ?? '/notifications',
    );
  }

  String _pushStatus(Map<String, dynamic> item) {
    final status = item['push_status']?.toString() ?? 'pending';
    final attempts = int.tryParse(item['push_attempts']?.toString() ?? '') ?? 0;
    switch (status) {
      case 'sent':
        return 'Push sent${attempts > 0 ? ' · $attempts attempt${attempts == 1 ? '' : 's'}' : ''}';
      case 'queued':
        return 'Push queued · $attempts attempt${attempts == 1 ? '' : 's'}';
      case 'failed':
        return 'Push failed after $attempts attempt${attempts == 1 ? '' : 's'}';
      case 'skipped':
        return 'Push skipped · in-app notification available';
      default:
        return 'Push pending';
    }
  }

  String _createdAt(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
    if (date == null) return '';
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minute = date.minute.toString().padLeft(2, '0');
    final suffix = date.hour < 12 ? 'AM' : 'PM';
    return '${date.day}/${date.month}/${date.year} · $hour:$minute $suffix';
  }

  @override
  Widget build(BuildContext context) {
    final token = context.watch<AuthProvider>().token ?? '';
    final provider = context.watch<NotificationProvider>();
    final categories = Map<String, dynamic>.from(
      provider.preferences['categories'] as Map? ?? const {},
    );
    final selectedTimezone =
        provider.preferences['timezone_name']?.toString() ?? 'Asia/Kolkata';
    final timezoneValue = _timezones.contains(selectedTimezone)
        ? selectedTimezone
        : 'Asia/Kolkata';
    final pushEnabled = provider.preferences['push_enabled'] == true;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Notifications'),
        backgroundColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: provider.isLoading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Push delivery',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      provider.canEnablePush
                          ? 'Choose whether GameGrub can send push alerts to this device.'
                          : provider.pushUnavailableReason,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Enable push notifications'),
                      value: pushEnabled,
                      onChanged:
                          provider.isLoading ||
                              provider.isSaving ||
                              (!provider.canEnablePush && !pushEnabled)
                          ? null
                          : (enabled) => provider.setPushEnabled(
                              token: token,
                              enabled: enabled,
                            ),
                    ),
                    DropdownButtonFormField<String>(
                      key: ValueKey(timezoneValue),
                      initialValue: timezoneValue,
                      decoration: const InputDecoration(
                        labelText: 'Reminder timezone',
                        prefixIcon: Icon(Icons.public_rounded),
                      ),
                      items: _timezones
                          .map(
                            (zone) => DropdownMenuItem(
                              value: zone,
                              child: Text(zone),
                            ),
                          )
                          .toList(),
                      onChanged:
                          provider.isLoading ||
                              provider.isSaving ||
                              token.isEmpty
                          ? null
                          : (zone) {
                              if (zone != null) {
                                provider.setTimezone(
                                  token: token,
                                  timezone: zone,
                                );
                              }
                            },
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Notification categories',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Choose which categories can send push alerts. In-app updates remain in your inbox.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                    const SizedBox(height: 8),
                    for (final entry
                        in NotificationProvider.categoryLabels.entries)
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(entry.value),
                        value: categories[entry.key] != false,
                        onChanged:
                            provider.isLoading ||
                                provider.isSaving ||
                                token.isEmpty
                            ? null
                            : (enabled) => provider.setCategory(
                                token: token,
                                category: entry.key,
                                enabled: enabled,
                              ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Recent activity',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                Text('${provider.notifications.length}'),
              ],
            ),
            if (provider.errorMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                provider.errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            if (provider.isLoading && provider.notifications.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (provider.notifications.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(child: Text('You are all caught up.')),
              )
            else
              ...provider.notifications.map((item) {
                final unread = item['is_read'] != true;
                final category =
                    NotificationProvider.categoryLabels[item['category']
                        ?.toString()] ??
                    'GameGrub update';
                final error = item['push_error']?.toString();
                return Card(
                  clipBehavior: Clip.antiAlias,
                  child: ListTile(
                    onTap: token.isEmpty
                        ? null
                        : () => _openNotification(provider, token, item),
                    leading: CircleAvatar(
                      backgroundColor: unread
                          ? AppTheme.primaryOrange.withValues(alpha: 0.16)
                          : AppTheme.elevatedSurface,
                      child: Icon(
                        unread
                            ? Icons.notifications_active_outlined
                            : Icons.notifications_none,
                        color: unread
                            ? AppTheme.primaryOrange
                            : AppTheme.secondaryText,
                      ),
                    ),
                    title: Text(
                      item['title']?.toString() ?? 'GameGrub update',
                      style: TextStyle(
                        fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item['message']?.toString() ?? ''),
                          const SizedBox(height: 6),
                          Text('$category · ${_createdAt(item['created_at'])}'),
                          Text(_pushStatus(item)),
                          if (error != null && error.isNotEmpty)
                            Text(
                              error,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                        ],
                      ),
                    ),
                    isThreeLine: true,
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
