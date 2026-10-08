import 'package:flutter_test/flutter_test.dart';
import 'package:agent_pro_ghana/features/transactions/zero_input_execution_gate.dart';

void main() {
  test('blocks overlapping zero-input attempts', () {
    final gate = ZeroInputExecutionGate();
    expect(gate.tryAcquire(), isTrue);
    expect(gate.isBusy, isTrue);
    expect(gate.tryAcquire(), isFalse);
    expect(gate.isBusy, isTrue);
  });

  test('permits a new user tap only after release', () {
    final gate = ZeroInputExecutionGate();
    expect(gate.tryAcquire(), isTrue);
    gate.release();
    expect(gate.isBusy, isFalse);
    expect(gate.tryAcquire(), isTrue);
  });
}
