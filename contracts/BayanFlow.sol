// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract BayanFlow is EIP712 {
    uint256 public constant PAYMENT_AMOUNT = 0.001 ether;
    bytes32 private constant PAYMENT_TYPEHASH =
        keccak256("Payment(bytes32 referenceId,address payer,uint256 amount,uint256 deadline)");

    address public immutable signer;
    address payable public immutable treasury;
    mapping(bytes32 => bool) public paid;

    error InvalidAddress();
    error IncorrectAmount();
    error AuthorizationExpired();
    error ReferenceAlreadyPaid(bytes32 referenceId);
    error InvalidAuthorization();
    error TreasuryTransferFailed();

    event PaymentReceived(bytes32 indexed referenceId, address indexed payer, uint256 amount);

    constructor(address paymentSigner, address payable paymentTreasury) EIP712("BayanFlow", "1") {
        if (paymentSigner == address(0) || paymentTreasury == address(0)) revert InvalidAddress();
        signer = paymentSigner;
        treasury = paymentTreasury;
    }

    function pay(bytes32 referenceId, uint256 deadline, bytes calldata signature) external payable {
        if (msg.value != PAYMENT_AMOUNT) revert IncorrectAmount();
        if (block.timestamp > deadline) revert AuthorizationExpired();
        if (paid[referenceId]) revert ReferenceAlreadyPaid(referenceId);

        bytes32 structHash = keccak256(abi.encode(PAYMENT_TYPEHASH, referenceId, msg.sender, msg.value, deadline));
        (address recovered, ECDSA.RecoverError error, ) = ECDSA.tryRecover(_hashTypedDataV4(structHash), signature);
        if (error != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidAuthorization();

        paid[referenceId] = true;
        (bool sent, ) = treasury.call{value: msg.value}("");
        if (!sent) revert TreasuryTransferFailed();

        emit PaymentReceived(referenceId, msg.sender, msg.value);
    }
}
