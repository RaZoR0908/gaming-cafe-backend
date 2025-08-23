const Cafe = require('../models/cafeModel');
const Booking = require('../models/bookingModel');

/**
 * @desc    Assign systems, start a session, and set booking to 'Active'
 * @route   POST /api/systems/start-session
 * @access  Private/Owner
 * @body    { bookingId: "...", systemIds: ["PC01", "PC02", "PS5-A"] }
 */
exports.startSession = async (req, res) => {
    const { bookingId, systemIds } = req.body;
    const ownerId = req.user.id;

    try {
        if (!bookingId || !systemIds || !Array.isArray(systemIds) || systemIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Booking ID and an array of system IDs are required.' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        const cafe = await Cafe.findOne({ owner: ownerId, _id: booking.cafe });
        if (!cafe) {
            return res.status(403).json({ success: false, message: 'User is not authorized to manage this booking.' });
        }

        if (booking.status !== 'Pending Assignment' && booking.status !== 'Booked') {
            return res.status(400).json({ success: false, message: `Booking cannot be started. Current status: ${booking.status}` });
        }

        // --- NEW VALIDATION: Check if the provided systems match the booking request ---
        const totalSystemsRequested = booking.systemsBooked.reduce((acc, curr) => acc + curr.numberOfSystems, 0);
        if (systemIds.length !== totalSystemsRequested) {
            return res.status(400).json({ success: false, message: `Mismatch: Booking requires ${totalSystemsRequested} systems, but ${systemIds.length} were provided.` });
        }

        // --- Update Cafe Document: Set systems to 'In Session' ---
        let validationError = null;
        cafe.rooms.forEach(room => {
            room.systems.forEach(system => {
                if (systemIds.includes(system.systemId)) {
                    if (system.status !== 'Available') {
                        validationError = `System ${system.systemId} is not available.`;
                    }
                    system.status = 'In Session';
                    system.activeBooking = booking._id;
                }
            });
        });

        if (validationError) {
            // This is a simple rollback. In a larger application, you'd use transactions.
            // For now, we just avoid saving the cafe document.
            return res.status(400).json({ success: false, message: validationError });
        }
        
        // --- Update Booking Document: Set to 'Active' and record assigned systems ---
        booking.status = 'Active';
        booking.assignedSystems = systemIds.map(id => ({ systemId: id }));
        
        // Atomically save both documents
        await booking.save();
        await cafe.save();

        res.status(200).json({
            success: true,
            message: 'Session started successfully.',
            data: { booking, cafe }
        });

    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

/**
 * @desc    End a session, free systems, and set booking to 'Completed'
 * @route   POST /api/systems/end-session
 * @access  Private/Owner
 * @body    { bookingId: "..." }
 */
exports.endSession = async (req, res) => {
    const { bookingId } = req.body;
    const ownerId = req.user.id;

    try {
        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Booking ID is required.' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        const cafe = await Cafe.findOne({ owner: ownerId, _id: booking.cafe });
        if (!cafe) {
            return res.status(403).json({ success: false, message: 'User is not authorized to manage this booking.' });
        }

        if (booking.status !== 'Active') {
            return res.status(400).json({ success: false, message: 'Only active sessions can be ended.' });
        }

        // --- Update Cafe Document: Set systems to 'Available' ---
        if (booking.assignedSystems && booking.assignedSystems.length > 0) {
            const assignedSystemIds = new Set(booking.assignedSystems.map(s => s.systemId));
            cafe.rooms.forEach(room => {
                room.systems.forEach(system => {
                    if (assignedSystemIds.has(system.systemId)) {
                        system.status = 'Available';
                        system.activeBooking = null;
                    }
                });
            });
        }
        
        // --- Update Booking Document: Set to 'Completed' ---
        booking.status = 'Completed';

        await booking.save();
        await cafe.save();

        res.status(200).json({
            success: true,
            message: 'Session ended successfully.',
            data: { booking, cafe }
        });

    } catch (error) {
        console.error('Error ending session:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * @desc    Update a system's status for maintenance
 * @route   PATCH /api/systems/:systemId/maintenance
 * @access  Private/Owner
 * @body    { status: "Under Maintenance" or "Available" }
 */
exports.updateSystemMaintenanceStatus = async (req, res) => {
    const { systemId } = req.params;
    const { status } = req.body;
    const ownerId = req.user.id;

    try {
        if (!status || (status !== 'Under Maintenance' && status !== 'Available')) {
            return res.status(400).json({ success: false, message: "Status must be 'Under Maintenance' or 'Available'." });
        }

        const cafe = await Cafe.findOne({ owner: ownerId });
        if (!cafe) {
            return res.status(404).json({ success: false, message: 'Cafe not found for this owner.' });
        }

        let systemToUpdate = null;
        for (const room of cafe.rooms) {
            const system = room.systems.find(s => s.systemId === systemId);
            if (system) {
                systemToUpdate = system;
                break;
            }
        }

        if (!systemToUpdate) {
            return res.status(404).json({ success: false, message: 'System not found.' });
        }

        if (systemToUpdate.status === 'In Session') {
            return res.status(400).json({ success: false, message: 'Cannot change maintenance status while a session is active.' });
        }

        systemToUpdate.status = status;
        await cafe.save();

        res.status(200).json({
            success: true,
            message: `System ${systemId} status updated to ${status}.`,
            data: cafe,
        });

    } catch (error) {
        console.error('Error updating system maintenance status:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Helper function to convert "02:00 PM" or "2:00 PM" to a 24-hour number like 14
const timeToHour = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const [time, modifier] = timeStr.split(' ');
    let [hours] = time.split(':');
    if (hours === '12') hours = '00';
    if (modifier && modifier.toUpperCase() === 'PM') hours = parseInt(hours, 10) + 12;
    return parseInt(hours, 10);
};

/**
 * @desc    Get real-time system availability and active session data for a cafe
 * @route   GET /api/systems/availability/:cafeId
 * @access  Private/Owner
 */
exports.getSystemAvailability = async (req, res) => {
    const { cafeId } = req.params;
    const ownerId = req.user.id;

    try {
        const cafe = await Cafe.findOne({ _id: cafeId, owner: ownerId }).populate({
            path: 'rooms.systems.activeBooking',
            model: 'Booking'
        });

        if (!cafe) {
            return res.status(404).json({ success: false, message: 'Cafe not found or unauthorized.' });
        }
        
        const availabilityData = {
            rooms: [],
            activeSessions: []
        };

        for (const room of cafe.rooms) {
            const roomData = { roomType: room.roomType, systems: [] };
            for (const system of room.systems) {
                const systemData = {
                    systemId: system.systemId,
                    systemType: system.systemType,
                    status: system.status,
                    activeBookingId: null,
                    customerName: null,
                    endTime: null,
                    remainingTime: null,
                };

                if (system.status === 'In Session' && system.activeBooking) {
                    const booking = system.activeBooking; // The populated booking document
                    systemData.activeBookingId = booking._id;
                    systemData.customerName = booking.walkInCustomerName || (booking.customer ? booking.customer.name : 'Customer');

                    // Calculate end time and remaining time
                    const bookingStartHour = timeToHour(booking.startTime);
                    const bookingDateTime = new Date(booking.bookingDate);
                    const timeParts = booking.startTime.match(/(\d+):(\d+)/);
                    const startMinutes = timeParts ? parseInt(timeParts[2], 10) : 0;
                    bookingDateTime.setHours(bookingStartHour, startMinutes, 0, 0);

                    const bookingEndDateTime = new Date(bookingDateTime.getTime() + booking.duration * 60 * 60 * 1000);
                    
                    systemData.endTime = bookingEndDateTime.toISOString();
                    systemData.remainingTime = Math.max(0, bookingEndDateTime.getTime() - Date.now());

                    availabilityData.activeSessions.push(systemData);
                }
                roomData.systems.push(systemData);
            }
            availabilityData.rooms.push(roomData);
        }

        res.status(200).json({
            success: true,
            data: availabilityData
        });

    } catch (error) {
        console.error('Error getting system availability:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * @desc    Extend an active session
 * @route   PATCH /api/systems/extend
 * @access  Private/Owner
 * @body    { bookingId: string, hoursToAdd: number }
 */
exports.extendSystemSession = async (req, res) => {
    const { bookingId, hoursToAdd } = req.body;
    const ownerId = req.user.id;

    try {
        if (!bookingId || !hoursToAdd || isNaN(hoursToAdd) || hoursToAdd <= 0) {
            return res.status(400).json({ success: false, message: 'A valid bookingId and hoursToAdd are required.' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.owner.toString() !== ownerId) {
            return res.status(403).json({ success: false, message: 'User not authorized to extend this booking.' });
        }

        if (booking.status !== 'Active') {
            return res.status(400).json({ success: false, message: 'Only active sessions can be extended.' });
        }

        const cafe = await Cafe.findById(booking.cafe);
        if (!cafe) {
            return res.status(404).json({ success: false, message: 'Cafe associated with booking not found.' });
        }

        let priceToAdd = 0;
        for (const item of booking.systemsBooked) {
            const room = cafe.rooms.find(r => r.roomType === item.roomType);
            if (!room) continue;
            const systemInfo = room.systems.find(s => s.systemType === item.systemType);
            if (systemInfo) {
                priceToAdd += item.numberOfSystems * systemInfo.pricePerHour * hoursToAdd;
            }
        }

        booking.duration += parseFloat(hoursToAdd);
        booking.totalPrice += priceToAdd;

        const updatedBooking = await booking.save();

        res.status(200).json({
            success: true,
            message: `Session extended by ${hoursToAdd} hours.`,
            data: updatedBooking
        });

    } catch (error) {
        console.error('Error extending session:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
