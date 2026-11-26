import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/utils/app_formatters.dart';

void main() {
  test('formatCurrency omits decimals for whole numbers', () {
    expect(formatCurrency(250), 'Rs 250');
    expect(formatCurrency(250.5), 'Rs 250.50');
  });

  test('formatDateTime uses dd/mm/yyyy with 12-hour time', () {
    final value = DateTime(2026, 4, 13, 17, 5);
    expect(formatDateTime(value), '13/04/2026 - 5:05 PM');
  });

  test('titleCase normalizes mixed casing and spacing', () {
    expect(titleCase('  gAMe   gRUb  lounge '), 'Game Grub Lounge');
  });

  test('buildPanelGradient returns the default brand colors', () {
    expect(
      buildPanelGradient(),
      const [Color(0x26FF7A1A), Color(0x1429D3C7)],
    );
  });
}
