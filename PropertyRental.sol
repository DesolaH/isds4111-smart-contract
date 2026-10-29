// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title PropertyRental
/// @notice One property rented for a flat fee until the tenant checks out.
contract PropertyRental {
    // The deploying account starts as the property owner.
    address public owner;
    string public propertyName;
    uint256 public rentAmount; // Flat fee per rental, measured in wei.
    address public tenant;
    bool public isRented;
    uint256 public unwithdrawnRent;

    event PropertyRented(address indexed tenant, uint256 amount);
    event RentalEnded(address indexed tenant);
    event RentAmountChanged(uint256 oldAmount, uint256 newAmount);
    event RentWithdrawn(address indexed owner, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can do this");
        _;
    }

    modifier onlyTenant() {
        require(isRented && msg.sender == tenant, "Only the current tenant can do this");
        _;
    }

    modifier whenAvailable() {
        require(!isRented, "Property is already rented");
        _;
    }

    constructor(string memory initialPropertyName, uint256 initialRentAmount) {
        require(bytes(initialPropertyName).length > 0, "Property name is required");
        require(initialRentAmount > 0, "Rent must be greater than zero");

        owner = msg.sender;
        propertyName = initialPropertyName;
        rentAmount = initialRentAmount;
        tenant = address(0);
        isRented = false;
        unwithdrawnRent = 0;
    }

    /// @notice Pay the exact flat fee to begin a rental.
    function rentProperty() public payable whenAvailable {
        require(msg.sender != owner, "Owner cannot rent their own property");
        require(msg.value == rentAmount, "Send the exact rent amount");

        tenant = msg.sender;
        isRented = true;
        unwithdrawnRent += msg.value;

        emit PropertyRented(msg.sender, msg.value);
    }

    /// @notice The tenant checks out. The flat rental fee is not refunded.
    function endRental() public onlyTenant {
        address previousTenant = tenant;
        tenant = address(0);
        isRented = false;

        emit RentalEnded(previousTenant);
    }

    /// @notice Change the fee only between rentals.
    function setRentAmount(uint256 newRentAmount) public onlyOwner whenAvailable {
        require(newRentAmount > 0, "Rent must be greater than zero");
        uint256 oldAmount = rentAmount;
        rentAmount = newRentAmount;

        emit RentAmountChanged(oldAmount, newRentAmount);
    }

    /// @notice Withdraw earned rental fees to the current owner's address.
    function withdrawRent() public onlyOwner {
        uint256 amount = unwithdrawnRent;
        require(amount > 0, "No rent to withdraw");

        // Update accounting before transferring ETH (checks-effects-interactions).
        unwithdrawnRent = 0;
        emit RentWithdrawn(owner, amount);
        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Rent withdrawal failed");
    }

    /// @notice Transfer contract ownership after checkout and withdrawal.
    /// @dev This updates the contract's owner; it does not transfer a legal deed.
    function transferOwnership(address newOwner) public onlyOwner whenAvailable {
        require(newOwner != address(0), "New owner cannot be the zero address");
        require(newOwner != owner, "New owner must be different");
        require(unwithdrawnRent == 0, "Withdraw earned rent before transferring");

        address previousOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
