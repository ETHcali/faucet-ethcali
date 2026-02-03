// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockPOAP for testing
 * @notice Simulates POAP's balanceOf(address, eventId) interface
 */
contract MockPOAP {
    // owner => eventId => balance
    mapping(address => mapping(uint256 => uint256)) private _balances;

    function mint(address to, uint256 eventId) external {
        _balances[to][eventId] += 1;
    }

    function balanceOf(address owner, uint256 eventId) external view returns (uint256) {
        return _balances[owner][eventId];
    }
}
