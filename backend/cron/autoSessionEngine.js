const db = require("../config/db");

function autoSessionEngine() {
    console.log("AUTO SESSION ENGINE RUNNING");

    const now = new Date();
    const currentHour = now.getHours();

    // START SESSION
    db.query(`
        SELECT
            b.booking_id,
            b.pc_id,
            MIN(bs.hour) AS start_hour
        FROM booking b
        JOIN booking_slots bs ON b.booking_id = bs.booking_id
        WHERE b.status='confirmed'
        AND b.booking_date = CURDATE()
        GROUP BY b.booking_id
    `, (err, bookings) => {

        if (err) {
            console.log("SESSION START ERROR", err);
            return;
        }

        bookings.forEach(b => {

            if (currentHour >= b.start_hour) {

                console.log("AUTO START SESSION", b.booking_id);

                db.query(`
                    UPDATE booking
                    SET status='running',
                        start_time = NOW()
                    WHERE booking_id=?
                `, [b.booking_id]);

                db.query(`
                    UPDATE pc
                    SET status='occupied'
                    WHERE pc_id=?
                `, [b.pc_id]);

            }

        });

    });

    // END SESSION

    db.query(`
        SELECT
            b.booking_id,
            b.start_time,
            b.pc_id,
            COUNT(bs.hour) AS total_slots
        FROM booking b
        JOIN booking_slots bs ON b.booking_id = bs.booking_id
        WHERE b.status='running'
        GROUP BY b.booking_id
    `, (err, sessions) => {

        if (err) {
            console.log("AUTO SESSION ERROR", err);
            return;
        }

        sessions.forEach(s => {

            if (!s.start_time) return;

            const start = new Date(s.start_time);
            const expectedEnd = new Date(
                start.getTime() + (s.total_slots * 60 * 60 * 1000)
            );

            if (now >= expectedEnd) {

                console.log("AUTO SESSION OVER", s.booking_id);

                db.query(`
                    UPDATE booking
                    SET status='session_over',
                        actual_end_time = NOW()
                    WHERE booking_id=?
                `, [s.booking_id]);

                db.query(`
                    UPDATE pc
                    SET status='active'
                    WHERE pc_id=?
                `, [s.pc_id]);

            }

        });

    });

}

module.exports = autoSessionEngine;
