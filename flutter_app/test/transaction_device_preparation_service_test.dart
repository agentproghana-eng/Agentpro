import 'package:flutter_test/flutter_test.dart';

import 'package:agent_pro_ghana/core/services/sim_card_service.dart';
import 'package:agent_pro_ghana/core/services/transaction_device_preparation_service.dart';

void main() {
  const mtnSim = SimCard(
    slot: 0,
    subscriptionId: 10,
    carrierName: 'MTN',
    network: 'mtn',
    operatorCode: '62001',
    iccid: 'ICCID-MTN-A',
  );

  const replacementMtnSim = SimCard(
    slot: 0,
    subscriptionId: 11,
    carrierName: 'MTN',
    network: 'mtn',
    operatorCode: '62001',
    iccid: 'ICCID-MTN-B',
  );

  const unresolvedMtnSim = SimCard(
    slot: 1,
    subscriptionId: 20,
    carrierName: 'MTN',
    network: 'mtn',
    operatorCode: '62001',
    iccid: '',
  );

  const telecelSim = SimCard(
    slot: 0,
    subscriptionId: 30,
    carrierName: 'Telecel',
    network: 'telecel',
    operatorCode: '62002',
    iccid: 'ICCID-TELECEL',
  );

  group('TransactionDevicePreparationService.selectMatchingSim', () {
    test('accepts the same ICCID and slot', () {
      final result = TransactionDevicePreparationService.selectMatchingSim(
        simCards: const [mtnSim],
        provider: 'mtn',
        requestedSimSlot: 0,
        requestedSimIccid: 'ICCID-MTN-A',
        requestedSimSubscriptionId: 999,
      );

      expect(result, same(mtnSim));
    });

    test('rejects a different ICCID even when the slot is unchanged', () {
      final result = TransactionDevicePreparationService.selectMatchingSim(
        simCards: const [replacementMtnSim],
        provider: 'mtn',
        requestedSimSlot: 0,
        requestedSimIccid: 'ICCID-MTN-A',
        requestedSimSubscriptionId: 10,
      );

      expect(result, isNull);
    });

    test('accepts the same fallback subscription ID and slot', () {
      final result = TransactionDevicePreparationService.selectMatchingSim(
        simCards: const [unresolvedMtnSim],
        provider: 'mtn',
        requestedSimSlot: 1,
        requestedSimIccid: '',
        requestedSimSubscriptionId: 20,
      );

      expect(result, same(unresolvedMtnSim));
    });

    test(
      'rejects a replacement SIM in the same slot when subscription ID changes',
      () {
        const replacement = SimCard(
          slot: 1,
          subscriptionId: 21,
          carrierName: 'MTN',
          network: 'mtn',
          operatorCode: '62001',
          iccid: '',
        );

        final result = TransactionDevicePreparationService.selectMatchingSim(
          simCards: const [replacement],
          provider: 'mtn',
          requestedSimSlot: 1,
          requestedSimIccid: '',
          requestedSimSubscriptionId: 20,
        );

        expect(result, isNull);
      },
    );

    test('rejects the same fallback subscription when the slot changes', () {
      const movedObservation = SimCard(
        slot: 0,
        subscriptionId: 20,
        carrierName: 'MTN',
        network: 'mtn',
        operatorCode: '62001',
        iccid: '',
      );

      final result = TransactionDevicePreparationService.selectMatchingSim(
        simCards: const [movedObservation],
        provider: 'mtn',
        requestedSimSlot: 1,
        requestedSimIccid: '',
        requestedSimSubscriptionId: 20,
      );

      expect(result, isNull);
    });

    test('rejects a SIM from a different provider', () {
      final result = TransactionDevicePreparationService.selectMatchingSim(
        simCards: const [telecelSim],
        provider: 'mtn',
        requestedSimSlot: 0,
        requestedSimIccid: 'ICCID-TELECEL',
        requestedSimSubscriptionId: 30,
      );

      expect(result, isNull);
    });
  });
}
